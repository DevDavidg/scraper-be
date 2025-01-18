from fastapi import FastAPI
from .routes import router

app = FastAPI()

# Registrar el router
app.include_router(router, prefix="/api")
