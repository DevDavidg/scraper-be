from fastapi import APIRouter, WebSocket
from .database import scraped_data_collection
from bson import ObjectId


router = APIRouter()
clients = []  

@router.get("/")
async def root():
    return {"message": "¡API funcionando correctamente!"}

@router.post("/tasks")
async def create_task(data: dict):
    result = scraped_data_collection.insert_one(data)

    document = scraped_data_collection.find_one({"_id": result.inserted_id})

    document["_id"] = str(document["_id"])
    
    for client in clients:
        try:
            await client.send_json(document)
        except Exception as e:
            print(f"Error enviando datos al WebSocket: {e}")
            clients.remove(client)
    
    return {"message": "Datos guardados exitosamente"}


@router.get("/data")
async def get_data():
    data = list(scraped_data_collection.find({}, {"_id": 0})) 
    return {"data": data}

@router.delete("/data")
async def delete_all_data():
    result = scraped_data_collection.delete_many({})
    for client in clients:
        await client.send_json({"message": "Todos los datos han sido eliminados"})
    return {"message": f"{result.deleted_count} documentos eliminados."}

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    print("Intentando conectar al WebSocket...")
    await websocket.accept()
    clients.append(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            print(f"Mensaje recibido del cliente: {data}")
    except Exception as e:
        print(f"WebSocket cerrado: {e}")
    finally:
        clients.remove(websocket)
