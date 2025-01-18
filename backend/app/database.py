from pymongo import MongoClient

client = MongoClient("mongodb://localhost:27017")
db = client.scraper_db
scraped_data_collection = db.scraped_data
