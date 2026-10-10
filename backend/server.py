import logging
import os

from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

from core import client, db, new_id, now_utc, passwords
from routers import auth, finance, school

app = FastAPI()
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "Presensi Kredit API"}


api_router.include_router(auth.router)
api_router.include_router(school.router)
api_router.include_router(finance.router)
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

SEED_CLASSES = [
    ("Gymnastic A", "gymnastic", "Senin & Rabu 15:00"),
    ("Gymnastic B", "gymnastic", "Selasa & Kamis 15:00"),
    ("Gymnastic C", "gymnastic", "Jumat 15:00"),
    ("Gymnastic D", "gymnastic", "Sabtu 09:00"),
    ("English A", "english", "Senin & Rabu 16:30"),
    ("English B", "english", "Selasa & Kamis 16:30"),
    ("English C", "english", "Jumat 16:30"),
    ("English D", "english", "Sabtu 10:30"),
]
SEED_STUDENTS = [
    ("Aisyah Putri", "Ibu Rina", "6281234567801", [0, 4], {"gymnastic": 3, "english": 0}),
    ("Bima Pratama", "Bapak Andi", "6281234567802", [0], {"gymnastic": 0}),
    ("Citra Lestari", "Ibu Dewi", "6281234567803", [1, 5], {"gymnastic": 10, "english": 1}),
    ("Daffa Ramadhan", "Bapak Joko", "6281234567804", [1], {"gymnastic": 2}),
    ("Elena Wijaya", "Ibu Sari", "6281234567805", [4], {"english": 4}),
    ("Farel Saputra", "Bapak Hadi", "6281234567806", [5], {"english": 1}),
    ("Gita Maharani", "Ibu Lina", "6281234567807", [2, 6], {"gymnastic": 4, "english": 11}),
    ("Hafiz Akbar", "Bapak Rudi", "6281234567808", [3, 7], {"gymnastic": 0, "english": 2}),
]


async def seed_user(email: str, password: str, name: str, role: str):
    await db.users.update_one(
        {"email": email.lower()},
        {"$setOnInsert": {
            "id": new_id(), "email": email.lower(), "name": name, "role": role,
            "password_hash": passwords.hash(password), "created_at": now_utc(),
        }},
        upsert=True,
    )


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await seed_user(os.environ["ADMIN_EMAIL"], os.environ["ADMIN_PASSWORD"], "Bagian Keuangan", "keuangan")
    await seed_user(os.environ["GURU_EMAIL"], os.environ["GURU_PASSWORD"], "Guru Kelas", "guru")
    if await db.classes.count_documents({}) == 0:
        ids = []
        for name, program, schedule in SEED_CLASSES:
            cid = new_id()
            ids.append(cid)
            await db.classes.insert_one({"id": cid, "name": name, "program": program, "schedule": schedule})
        for name, parent, phone, idxs, credits in SEED_STUDENTS:
            wallets = {p: {"credits": c, "izin_quota": 1 if c < 5 else 3, "makeup": 0, "package": 4 if c < 5 else 12}
                       for p, c in credits.items()}
            await db.students.insert_one({
                "id": new_id(), "name": name, "parent_name": parent, "parent_phone": phone,
                "class_ids": [ids[i] for i in idxs], "wallets": wallets, "created_at": now_utc(),
            })
        logger.info("Seeded classes and demo students")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
