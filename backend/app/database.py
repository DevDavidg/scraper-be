from pymongo.mongo_client import MongoClient
from dotenv import load_dotenv
import logging
import os

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s - %(levelname)s - %(message)s",
)

load_dotenv()

uri = os.getenv("MONGO_URI")

if not uri:
    logging.error("No se encontró la variable de entorno MONGO_URI. Verifica tu archivo .env.")
    exit(1)

try:
    client = MongoClient(uri)
    client.admin.command("ping")  
    logging.info("Conexión exitosa a MongoDB.")
except Exception as e:
    logging.critical(f"Error al conectar con MongoDB: {e}", exc_info=True)
    exit(1)

try:
    db = client["cluster_data"]
    scraped_data_collection = db["scraped_data"]
    logging.info("Base de datos y colección configuradas correctamente.")
except Exception as e:
    logging.error(f"Error al acceder a la base de datos o colección: {e}", exc_info=True)
    exit(1)


