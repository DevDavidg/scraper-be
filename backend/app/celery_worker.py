from celery import Celery

celery = Celery(
    "tasks",
    broker="amqp://guest:guest@localhost:5672//",
    backend="rpc://"
)

@celery.task
def add_data_to_db(data):
    from .database import scraped_data_collection
    scraped_data_collection.insert_one(data)
    return "Data added"
