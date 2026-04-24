"""
Configuration for the German car reliability data pipeline.

Model names come from the NHTSA API (discovered via discover_models.py).
This list has been curated to include only consumer cars:
  - No motorcycles or scooters (BMW Motorrad)
  - No commercial vans (Mercedes Sprinter, Metris)
  - No ultra-rare limited editions with few complaints

To add a model, run discover_models.py to find the exact NHTSA name.
"""

START_YEAR = 2010
END_YEAR = 2024

GERMAN_CARS = {
    "BMW": [
        # 1 Series
        "128I",
        "135I",
        # 2 Series
        "228I",
        "228I XDRIVE",
        "M235I",
        "M240I",
        "M2",
        # 3 Series
        "3 SERIES",
        "3 SERIES SEDAN",
        "320I",
        "320I XDRIVE",
        "328I",
        "328I XDRIVE",
        "328D",
        "330E",
        "335I",
        "335I XDRIVE",
        "M3",
        "M340I",
        # 4 Series
        "4 SERIES",
        "4 SERIES GRAN COUPE",
        "428I",
        "428I XDRIVE",
        "435I",
        "M4",
        "M440I",
        # 5 Series
        "5 SERIES",
        "5 SERIES SEDAN",
        "528I",
        "528I XDRIVE",
        "535I",
        "535I XDRIVE",
        "540I",
        "550I",
        "M5",
        "M550I",
        # 7 Series
        "7 SERIES",
        "7 SERIES SEDAN",
        "740I",
        "750I",
        "750I XDRIVE",
        # SUVs
        "X1",
        "X2",
        "X3",
        "X3 M",
        "X4",
        "X5",
        "X5 M",
        "X6",
        "X7",
        # Electric
        "I3",
        "I4",
        "I4 GRAN COUPE",
        "IX",
        # Z4
        "Z4",
    ],
    "MERCEDES-BENZ": [
        # A / CLA
        "A-CLASS",
        "CLA",
        "CLA-CLASS",
        # C-Class
        "C-CLASS",
        "C-CLASS COUPE",
        "C-CLASS CABRIOLET",
        # E-Class
        "E-CLASS",
        "E-CLASS COUPE",
        "E-CLASS CABRIOLET",
        "E-CLASS WAGON",
        # S-Class
        "S-CLASS",
        "S-CLASS COUPE",
        # CLS
        "CLS-CLASS",
        # SL / SLK / SLC
        "SL-CLASS",
        "SLK-CLASS",
        "SLC-CLASS",
        # SUVs
        "GLA",
        "GLA-CLASS",
        "GLB",
        "GLB-CLASS",
        "GLC",
        "GLC-CLASS",
        "GLC-CLASS COUPE",
        "GLE",
        "GLE-CLASS",
        "GLE-CLASS COUPE",
        "GLK-CLASS",
        "GL-CLASS",
        "GLS",
        "GLS-CLASS",
        "ML-CLASS",
        # G-Class
        "G-CLASS",
        # AMG
        "AMG C43",
        "AMG GT",
        "AMG GT-CLASS",
        "AMG G63",
        "AMG GLC43",
        "AMG GLC63",
        # Electric
        "EQB",
        "EQE",
        "EQE SUV",
        "EQS",
        "EQS SUV",
    ],
    "AUDI": [
        # A models
        "A3",
        "A4",
        "A4 ALLROAD",
        "A5",
        "A5 SPORTBACK",
        "A6",
        "A6 ALLROAD",
        "A7",
        "A8",
        # Q models (SUVs)
        "Q3",
        "Q5",
        "Q5 SPORTBACK",
        "Q7",
        "Q8",
        # S models (sport)
        "S3",
        "S4",
        "S5",
        "S5 SPORTBACK",
        "S6",
        "S7",
        "SQ5",
        "SQ7",
        "SQ8",
        # RS models (performance)
        "RS 3",
        "RS 5",
        "RS 7",
        "RS Q8",
        # Electric
        "E-TRON",
        "E-TRON SPORTBACK",
        "Q4 E-TRON",
        # Sports
        "TT",
        "TT RS",
        "R8",
    ],
    "VOLKSWAGEN": [
        "JETTA",
        "JETTA GLI",
        "GOLF",
        "GOLF GTI",
        "GOLF R",
        "GOLF SPORTWAGEN",
        "GTI",
        "PASSAT",
        "CC",
        "ARTEON",
        "TIGUAN",
        "ATLAS",
        "ATLAS CROSS SPORT",
        "TAOS",
        "BEETLE",
        "EOS",
        "TOUAREG",
        "ID.4",
    ],
    "PORSCHE": [
        # 911
        "911",
        "911 CARRERA",
        "911 CARRERA S",
        "911 CARRERA 4S",
        "911 TURBO",
        "911 TURBO S",
        "911 GT3",
        "911 TARGA 4",
        "911 TARGA 4S",
        # 718
        "718 BOXSTER",
        "718 BOXSTER S",
        "718 CAYMAN",
        "718 CAYMAN S",
        "BOXSTER",
        "BOXSTER S",
        "CAYMAN",
        "CAYMAN S",
        "CAYMAN GT4",
        # SUVs
        "CAYENNE",
        "CAYENNE S",
        "CAYENNE TURBO",
        "CAYENNE E-HYBRID",
        "CAYENNE COUPE",
        "MACAN",
        "MACAN S",
        "MACAN GTS",
        "MACAN TURBO",
        # Sedan
        "PANAMERA",
        "PANAMERA 4",
        "PANAMERA 4S",
        "PANAMERA TURBO",
        "PANAMERA 4 E-HYBRID",
        # Electric
        "TAYCAN",
        "TAYCAN 4S",
    ],
}

DATABASE_PATH = "data/cars.db"