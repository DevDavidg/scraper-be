from pymongo.mongo_client import MongoClient
from dotenv import load_dotenv
import os

load_dotenv()

uri = os.getenv("MONGO_URI")

client = MongoClient(uri)

try:
    client.admin.command("ping")
    print("Pinged your deployment. You successfully connected to MongoDB!")
except Exception as e:
    print(e)

db = client["cluster_data"]  
scraped_data_collection = db["scraped_data"]  
