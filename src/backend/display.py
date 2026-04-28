"""Display-label fallback chain for species without common names.

Priority:
  1. species common_name (from metadata sqlite)
  2. genus vernacular (e.g. "Vulpes" → "fox")
  3. family vernacular (e.g. "Strigidae" → "typical owls")
  4. order → English noun (e.g. "Strigiformes" → "owl")
  5. class → English noun (e.g. "Aves" → "bird")
  6. null — give up and let the UI show scientific_name
"""
from __future__ import annotations

from typing import Any

# Scientific order → plain English collective noun. Covers the ~50 orders that
# make up the vast majority of iNaturalist animal observations. Anything not
# listed here falls through to the class-level fallback.
ORDER_ENGLISH: dict[str, str] = {
    # Mammals
    "Carnivora": "carnivore",
    "Rodentia": "rodent",
    "Chiroptera": "bat",
    "Cetartiodactyla": "even-toed ungulate",
    "Primates": "primate",
    "Lagomorpha": "lagomorph",
    "Soricomorpha": "shrew",
    "Afrosoricida": "tenrec",
    "Didelphimorphia": "opossum",
    "Diprotodontia": "marsupial",
    "Eulipotyphla": "insectivore",
    "Perissodactyla": "odd-toed ungulate",
    "Pilosa": "sloth",
    "Cingulata": "armadillo",
    "Proboscidea": "elephant",
    "Sirenia": "sea cow",
    "Monotremata": "monotreme",
    "Macroscelidea": "elephant shrew",
    "Scandentia": "treeshrew",
    "Dermoptera": "colugo",
    "Pholidota": "pangolin",
    "Tubulidentata": "aardvark",
    "Hyracoidea": "hyrax",
    # Birds
    "Passeriformes": "perching bird",
    "Accipitriformes": "bird of prey",
    "Anseriformes": "waterfowl",
    "Apodiformes": "swift",
    "Caprimulgiformes": "nightjar",
    "Charadriiformes": "shorebird",
    "Ciconiiformes": "stork",
    "Columbiformes": "dove",
    "Coraciiformes": "roller",
    "Cuculiformes": "cuckoo",
    "Falconiformes": "falcon",
    "Galliformes": "gamebird",
    "Gaviiformes": "loon",
    "Gruiformes": "crane",
    "Opisthocomiformes": "hoatzin",
    "Pelecaniformes": "pelican",
    "Piciformes": "woodpecker",
    "Podicipediformes": "grebe",
    "Procellariiformes": "seabird",
    "Psittaciformes": "parrot",
    "Pterocliformes": "sandgrouse",
    "Sphenisciformes": "penguin",
    "Strigiformes": "owl",
    "Struthioniformes": "ostrich",
    "Suliformes": "cormorant",
    "Tinamiformes": "tinamou",
    "Trogoniformes": "trogon",
    "Bucerotiformes": "hornbill",
    "Coliiformes": "mousebird",
    "Leptosomiformes": "cuckoo roller",
    "Mesitornithiformes": "mesite",
    "Otidiformes": "bustard",
    "Phaethontiformes": "tropicbird",
    "Phoenicopteriformes": "flamingo",
    "Podargiformes": "frogmouth",
    "Steatornithiformes": "oilbird",
    # Reptiles
    "Squamata": "lizard",
    "Testudines": "turtle",
    "Crocodilia": "crocodilian",
    "Rhynchocephalia": "tuatara",
    # Amphibians
    "Anura": "frog",
    "Caudata": "salamander",
    "Gymnophiona": "caecilian",
    # Fish
    "Perciformes": "perch-like fish",
    "Cypriniformes": "carp",
    "Siluriformes": "catfish",
    "Salmoniformes": "salmon",
    "Characiformes": "characin",
    "Cyprinodontiformes": "killifish",
    "Beloniformes": "needlefish",
    "Scorpaeniformes": "scorpionfish",
    "Pleuronectiformes": "flatfish",
    "Tetraodontiformes": "pufferfish",
    "Clupeiformes": "herring",
    "Gadiformes": "cod",
    "Lophiiformes": "anglerfish",
    "Syngnathiformes": "pipefish",
    "Ophidiiformes": "cusk-eel",
    "Atheriniformes": "silverside",
    "Mugiliformes": "mullet",
    "Batrachoidiformes": "toadfish",
    "Esoxiformes": "pike",
    "Osmeriformes": "smelt",
    "Stomiiformes": "dragonfish",
    "Myliobatiformes": "ray",
    "Rajiformes": "skate",
    "Carcharhiniformes": "requiem shark",
    "Lamniformes": "mackerel shark",
    "Orectolobiformes": "carpet shark",
    "Squaliformes": "dogfish",
    "Squatiniformes": "angel shark",
    "Pristiformes": "sawfish",
    "Chimaeriformes": "chimaera",
    "Acipenseriformes": "sturgeon",
    "Lepisosteiformes": "gar",
    "Amiiformes": "bowfin",
    "Polypteriformes": "bichir",
    # Insects
    "Coleoptera": "beetle",
    "Lepidoptera": "butterfly",
    "Hymenoptera": "wasp",
    "Diptera": "fly",
    "Hemiptera": "true bug",
    "Orthoptera": "grasshopper",
    "Odonata": "dragonfly",
    "Blattodea": "cockroach",
    "Mantodea": "mantis",
    "Phasmatodea": "stick insect",
    "Dermaptera": "earwig",
    "Plecoptera": "stonefly",
    "Trichoptera": "caddisfly",
    "Neuroptera": "lacewing",
    "Ephemeroptera": "mayfly",
    "Mecoptera": "scorpionfly",
    "Siphonaptera": "flea",
    "Strepsiptera": "twisted-wing insect",
    "Thysanoptera": "thrips",
    "Psocodea": "bark louse",
    "Megaloptera": "alderfly",
    "Raphidioptera": "snakefly",
    "Grylloblattodea": "rock crawler",
    "Mantophasmatodea": "gladiator",
    "Zoraptera": "angel insect",
    "Embioptera": "webspinner",
    "Isoptera": "termite",
    # Arachnids
    "Araneae": "spider",
    "Scorpiones": "scorpion",
    "Opiliones": "harvestman",
    "Acari": "mite",
    "Pseudoscorpiones": "pseudoscorpion",
    "Solifugae": "sun spider",
    # Other arthropods
    "Decapoda": "crab",
    "Isopoda": "isopod",
    "Amphipoda": "amphipod",
    "Colembola": "springtail",
    # Mollusks
    "Stylommatophora": "land snail",
    "Neogastropoda": "sea snail",
    "Mesogastropoda": "sea snail",
    "Littorinimorpha": "sea snail",
    "Veneroida": "clam",
    "Ostreoida": "oyster",
    "Mytiloida": "mussel",
    "Cephalopoda": "cephalopod",
    # Other invertebrates
    "Nudibranchia": "nudibranch",
    "Scleractinia": "hard coral",
    "Actiniaria": "sea anemone",
    "Echinoida": "sea urchin",
}

CLASS_ENGLISH: dict[str, str] = {
    "Mammalia": "mammal",
    "Aves": "bird",
    "Reptilia": "reptile",
    "Amphibia": "amphibian",
    "Actinopterygii": "ray-finned fish",
    "Elasmobranchii": "cartilaginous fish",
    "Chondrichthyes": "cartilaginous fish",
    "Insecta": "insect",
    "Arachnida": "arachnid",
    "Malacostraca": "crustacean",
    "Gastropoda": "snail",
    "Bivalvia": "bivalve",
    "Cephalopoda": "cephalopod",
    "Anthozoa": "coral",
    "Echinoidea": "sea urchin",
    "Asteroidea": "starfish",
    "Holothuroidea": "sea cucumber",
    "Merostomata": "horseshoe crab",
    "Collembola": "springtail",
    "Diplopoda": "millipede",
    "Chilopoda": "centipede",
    "Clitellata": "leech",
    "Polychaeta": "bristle worm",
    "Hydrozoa": "hydrozoan",
    "Scyphozoa": "jellyfish",
    "Turbellaria": "flatworm",
}


def compute_display_label(meta: dict[str, Any]) -> str | None:
    """Return the best available English label for a species metadata row.

    `meta` is a row dict from MetaStore.lookup_many(), which already carries
    genus_english and family_english from the rank vernacular tables.
    """
    # 1. Species-level common name
    if meta.get("common_name"):
        return meta["common_name"]

    # 2. Genus vernacular
    genus_en = meta.get("genus_english")
    if genus_en:
        return genus_en

    # 3. Family vernacular
    family_en = meta.get("family_english")
    if family_en:
        return family_en

    # 4. Order → English noun
    order_en = ORDER_ENGLISH.get(meta.get("order") or "")
    if order_en:
        return order_en

    # 5. Class → English noun
    class_en = CLASS_ENGLISH.get(meta.get("class") or "")
    if class_en:
        return class_en

    return None
