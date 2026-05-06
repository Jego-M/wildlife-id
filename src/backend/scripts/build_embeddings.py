#!/usr/bin/env python3
"""Generate species text embeddings + shared metadata sqlite.

Outputs two artifacts:
  - <model-dir>/<model-id>/species_embeddings.npz  (per-model, fp16 embeddings + sci_names)
  - <vocab-dir>/species_meta.sqlite                 (shared across models)

Full TreeOfLife vocabulary (~414k animal species, recommended):
    python -c "
    from huggingface_hub import hf_hub_download
    hf_hub_download('imageomics/TreeOfLife-10M',
                    'metadata/species_level_taxonomy_chains.csv',
                    repo_type='dataset', local_dir='/tmp/tol-meta')
    "
    python build_embeddings.py --treeoflife \\
        --species-csv /tmp/tol-meta/metadata/species_level_taxonomy_chains.csv

Bundled mini-vocabulary (~200 species, fast dev iteration):
    python build_embeddings.py

iNaturalist DwCA format:
    python build_embeddings.py --inaturalist --species-csv /path/to/taxa.csv

Options: --model-id, --model-dir, --vocab-dir, --embeddings-out, --meta-out, --device
"""
from __future__ import annotations

import argparse
import csv
import logging
import os
import sys
from pathlib import Path

import numpy as np
import torch
import open_clip

# Allow `python scripts/build_embeddings.py` from the backend dir.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from vocab import save_embeddings, write_metadata_sqlite  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ANIMAL_KINGDOMS = {"Animalia"}
ANIMAL_CLASSES = {
    "Mammalia", "Aves", "Reptilia", "Amphibia", "Actinopterygii",
    "Chondrichthyes", "Insecta", "Arachnida", "Malacostraca",
    "Gastropoda", "Cephalopoda", "Bivalvia", "Merostomata",
}

MODEL_CONFIGS = {
    "bioclip-v1": {"hf_repo": "imageomics/bioclip", "arch": "ViT-B-16", "weight_file": "open_clip_pytorch_model.bin"},
    "bioclip-v2": {"hf_repo": "imageomics/bioclip-2", "arch": "ViT-L-14", "weight_file": "open_clip_pytorch_model.bin"},
}


def load_standard_csv(path: Path) -> list[dict]:
    species = []
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            sci = row.get("scientific_name", "").strip()
            if not sci:
                continue
            genus = sci.split()[0]
            species.append({
                "scientific_name": sci,
                "common_name": row.get("common_name", "").strip() or None,
                "iucn_status": row.get("iucn_status", "").strip() or None,
                "kingdom": row.get("kingdom", "").strip(),
                "phylum": row.get("phylum", "").strip(),
                "class_": row.get("class", "").strip(),
                "order": row.get("order", "").strip(),
                "family": row.get("family", "").strip(),
                "genus": genus,
            })
    return species


def load_treeoflife_csv(path: Path) -> list[dict]:
    """Parse imageomics/TreeOfLife-10M metadata/species_level_taxonomy_chains.csv."""
    def _common(name: str, lang: str) -> str | None:
        if not name.strip():
            return None
        langs = [lg.strip().lower() for lg in lang.split(",")]
        names = [n.strip() for n in name.split(",")]
        for i, lg in enumerate(langs):
            if "english" in lg and i < len(names) and names[i]:
                return names[i]
        return names[0] if names[0] else None

    species: list[dict] = []
    seen: set[str] = set()
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["Kingdom"] != "Animalia":
                continue
            sci = row["Species"].strip()
            cls = row["Class"].strip()
            if not sci or not cls or sci in seen:
                continue
            seen.add(sci)
            species.append({
                "scientific_name": sci,
                "common_name": _common(row.get("terminal_vernacular", ""), row.get("terminal_vernacular_lang", "")),
                "iucn_status": None,
                "kingdom": row["Kingdom"].strip(),
                "phylum": row["Phylum"].strip(),
                "class_": cls,
                "order": row["Order"].strip(),
                "family": row["Family"].strip(),
                "genus": row["Genus"].strip(),
            })
    logger.info("Loaded %d animal species from TreeOfLife CSV", len(species))
    return species


def load_inaturalist_csv(path: Path) -> list[dict]:
    """Parse iNaturalist DwCA taxa.csv — filters to animal species only."""
    species: list[dict] = []
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("taxonRank", "").lower() != "species":
                continue
            kingdom = row.get("kingdom", "").strip()
            if kingdom not in ANIMAL_KINGDOMS:
                continue
            class_ = row.get("class", "").strip()
            if class_ and class_ not in ANIMAL_CLASSES:
                continue
            sci = row.get("scientificName", "").strip()
            if not sci:
                continue
            species.append({
                "scientific_name": sci,
                "common_name": row.get("vernacularName", "").strip() or None,
                "iucn_status": None,
                "kingdom": kingdom,
                "phylum": row.get("phylum", "").strip(),
                "class_": class_,
                "order": row.get("order", "").strip(),
                "family": row.get("family", "").strip(),
                "genus": sci.split()[0],
            })
    logger.info("Filtered to %d animal species from iNaturalist CSV", len(species))
    return species


def make_prompt(sp: dict) -> str:
    parts = [sp["kingdom"], sp["phylum"], sp["class_"], sp["order"], sp["family"], sp["genus"], sp["scientific_name"]]
    return "a photo of " + " ".join(p for p in parts if p)


def generate(model, tokenizer, device: str, species: list[dict], batch_size: int = 64) -> torch.Tensor:
    prompts = [make_prompt(sp) for sp in species]
    chunks = []
    for i in range(0, len(prompts), batch_size):
        batch = prompts[i : i + batch_size]
        tokens = tokenizer(batch).to(device)
        with torch.no_grad():
            emb = model.encode_text(tokens)
            emb = emb / emb.norm(dim=-1, keepdim=True)
        chunks.append(emb.cpu().float())
        if (i // batch_size) % 10 == 0:
            logger.info("  %d / %d", min(i + batch_size, len(prompts)), len(prompts))
    return torch.cat(chunks, dim=0)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build species embeddings for Wildlife ID")
    parser.add_argument("--model-id", default="bioclip-v1", choices=list(MODEL_CONFIGS))
    parser.add_argument("--model-dir", default=None, help="Directory containing downloaded models")
    parser.add_argument("--vocab-dir", default=None, help="Directory for shared metadata sqlite")
    parser.add_argument("--species-csv", default=None, help="Path to species CSV (default: bundled data/species.csv)")
    parser.add_argument("--embeddings-out", default=None, help="Output .npz path")
    parser.add_argument("--meta-out", default=None, help="Output sqlite path")
    parser.add_argument("--inaturalist", action="store_true", help="Parse CSV as iNaturalist DwCA taxa.csv format")
    parser.add_argument("--treeoflife", action="store_true", help="Parse CSV as TreeOfLife species_level_taxonomy_chains.csv")
    parser.add_argument("--device", default=None, help="cpu / cuda / mps (auto-detected if omitted)")
    parser.add_argument(
        "--no-fp16",
        action="store_true",
        help="Save embeddings as float32 instead of float16. Doubles on-disk size; only useful for debugging precision issues.",
    )
    parser.add_argument(
        "--skip-meta",
        action="store_true",
        help="Skip writing/upserting the metadata sqlite. Use when re-building per-model embeddings on a system that already has a richer meta sqlite (e.g. merged via build_metadata.py).",
    )
    args = parser.parse_args()

    cfg = MODEL_CONFIGS[args.model_id]

    # Resolve paths
    if args.model_dir is None:
        args.model_dir = os.path.join(os.path.expanduser("~"), ".wildlife-id", "models")
    model_path = Path(args.model_dir) / args.model_id

    if args.vocab_dir is None:
        args.vocab_dir = str(Path(args.model_dir).parent / "vocab")
    vocab_path = Path(args.vocab_dir)

    if args.species_csv is None:
        args.species_csv = str(Path(__file__).parent.parent / "data" / "species.csv")
    csv_path = Path(args.species_csv)

    if args.embeddings_out is None:
        args.embeddings_out = str(model_path / "species_embeddings.npz")
    embeddings_out = Path(args.embeddings_out)

    if args.meta_out is None:
        args.meta_out = str(vocab_path / "species_meta.sqlite")
    meta_out = Path(args.meta_out)

    # Find weight file
    weight_file = model_path / cfg["weight_file"]
    if not weight_file.exists():
        for ext in ("*.bin", "*.safetensors"):
            found = [f for f in model_path.rglob(ext) if ".cache" not in f.parts]
            if found:
                weight_file = found[0]
                break
    if not weight_file.exists():
        logger.error("Model weights not found in %s. Download the model first.", model_path)
        sys.exit(1)

    # Device
    if args.device:
        device = args.device
    elif torch.cuda.is_available():
        device = "cuda"
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        device = "mps"
    else:
        device = "cpu"

    logger.info("Loading %s on %s from %s", args.model_id, device, weight_file)
    model, _, _ = open_clip.create_model_and_transforms(cfg["arch"], pretrained=str(weight_file))
    model.eval().to(device)
    tokenizer = open_clip.get_tokenizer(cfg["arch"])

    logger.info("Loading species from %s", csv_path)
    if args.treeoflife:
        species = load_treeoflife_csv(csv_path)
    elif args.inaturalist:
        species = load_inaturalist_csv(csv_path)
    else:
        species = load_standard_csv(csv_path)

    if not species:
        logger.error("No species loaded. Check your CSV.")
        sys.exit(1)
    logger.info("Generating embeddings for %d species...", len(species))

    embeddings = generate(model, tokenizer, device, species)

    # Cast to fp16 for storage. Vectors are unit-normalised so values are in
    # [-1, 1] — fp16's ~3 decimal digits of mantissa precision is well below
    # the noise floor of softmax(top_k) over a vocabulary this size. Predictor
    # casts back to fp32 at load time for the matmul.
    array = embeddings.numpy()
    if not args.no_fp16:
        array = array.astype(np.float16)
        logger.info("Saving embeddings as fp16 (use --no-fp16 to keep float32)")

    save_embeddings(embeddings_out, array, [sp["scientific_name"] for sp in species])
    if args.skip_meta:
        logger.info("Skipping metadata sqlite write (--skip-meta)")
    else:
        write_metadata_sqlite(meta_out, species)


if __name__ == "__main__":
    main()
