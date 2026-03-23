import certifi
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings

client: AsyncIOMotorClient = None
db = None


async def connect_db():
    global client, db
    client = AsyncIOMotorClient(settings.mongodb_uri, tlsCAFile=certifi.where())
    db = client[settings.database_name]


async def close_db():
    global client
    if client:
        client.close()


def get_db():
    return db
