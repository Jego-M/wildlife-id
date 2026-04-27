# Hosting the Species Vocabulary on HuggingFace

The 414k-species embeddings file must be uploaded once to a HuggingFace dataset repo so
end users receive it automatically when they click "Download" in the app.

## Prerequisites

```bash
pip install huggingface_hub
huggingface-cli login   # authenticates via browser
```

## Step 1 — Create the dataset repo

```bash
huggingface-cli repo create wildlife-id-vocab --type dataset
```

Make it **public** so no token is required for downloads.

## Step 2 — Upload bioclip-v1 embeddings

```python
from huggingface_hub import HfApi

api = HfApi()
api.upload_file(
    path_or_fileobj=os.path.expanduser("~/.config/wildlife-id/models/bioclip-v1/species_embeddings.npz"),
    path_in_repo="bioclip-v1/species_embeddings.npz",
    repo_id="YOUR_HF_USERNAME/wildlife-id-vocab",
    repo_type="dataset",
)
```

The file is ~793 MB — the upload will take a few minutes.

## Step 3 — Wire it up in predictor.py

Replace `PLACEHOLDER` with your HuggingFace username in both `MODEL_CONFIGS` entries
in `src/backend/predictor.py`:

```python
"vocab_hf_repo": "YOUR_HF_USERNAME/wildlife-id-vocab",
```

## Step 4 (when ready) — Generate and upload bioclip-v2 embeddings

```bash
python src/backend/scripts/build_embeddings.py \
    --treeoflife \
    --model-id bioclip-v2 \
    --species-csv /tmp/tol-meta/metadata/species_level_taxonomy_chains.csv
```

Then upload the result:

```python
api.upload_file(
    path_or_fileobj=os.path.expanduser("~/.config/wildlife-id/models/bioclip-v2/species_embeddings.npz"),
    path_in_repo="bioclip-v2/species_embeddings.npz",
    repo_id="YOUR_HF_USERNAME/wildlife-id-vocab",
    repo_type="dataset",
)
```

## How it works at runtime

When a user downloads a model through the app:

1. `snapshot_download` fetches the BioCLIP weights from `imageomics/bioclip` (~600 MB)
2. The app streams `species_embeddings.npz` from your dataset repo (~793 MB) and saves
   it to `<userData>/models/<model-id>/species_embeddings.npz`
3. Both phases report byte progress to the same download bar in the UI

If `species_embeddings.npz` already exists in the model directory (e.g. on your dev
machine), the vocab download is skipped automatically.
