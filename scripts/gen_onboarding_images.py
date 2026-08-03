"""Génère les 5 images héros de l'onboarding Jokoo via Gemini Nano Banana.
Style : African premium, éditorial Pinterest, cinématographique, personnes noires.
"""
import asyncio
import base64
import os
import sys
from pathlib import Path

# Load env from /app/backend/.env
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

from emergentintegrations.llm.chat import LlmChat, UserMessage

OUT = Path("/app/frontend/assets/onboarding")
OUT.mkdir(parents=True, exist_ok=True)

# Direction artistique commune (préfixe pour toutes les images)
STYLE = (
    "Cinematic editorial photograph, portrait orientation 9:16 vertical composition, "
    "premium magazine quality, warm golden hour lighting with deep navy shadows and turquoise accents, "
    "shallow depth of field, aspirational Pinterest African premium aesthetic, "
    "modern elegant styling, confident professional Black African subject. "
)

IMAGES = [
    {
        "key": "welcome",
        "prompt": (
            STYLE +
            "Candid documentary shot: a confident young Black Senegalese woman in her 20s laughing genuinely "
            "while looking at her smartphone in a chic African contemporary living room. She's wearing a stylish "
            "modern outfit blending West African prints with minimalist tailoring. Warm afternoon sunlight filters "
            "through curtains. Plants, art books, ceramic vase, wooden furniture visible. "
            "Real emotion — a moment of joy caught naturally. Story: 'she just booked her favorite hairstylist.'"
        ),
    },
    {
        "key": "services",
        "prompt": (
            STYLE +
            "Dynamic documentary photograph: a confident young Black African hairstylist in a stylish modern salon "
            "concentrating intently as she braids the hair of a smiling client. Both women engaged, warm eye contact. "
            "The stylist wears a chic dark denim apron over a fitted top, gold jewelry. Salon interior has pink-navy walls, "
            "gold-framed mirrors, ring lights, styling products organized elegantly. Real moment of professional artistry. "
            "Story: 'trust and skill in action, everyday luxury in Dakar.'"
        ),
    },
    {
        "key": "mobility",
        "prompt": (
            STYLE +
            "Documentary street photograph: a friendly young Black Senegalese delivery courier in a modern branded uniform, "
            "handing a beautifully wrapped package to a smiling young woman on her doorstep in a warm afternoon in Dakar. "
            "His premium electric scooter visible in soft focus behind. Real interaction — genuine smiles, human warmth. "
            "Palm trees, warm terracotta walls in background. Story: 'connection, service, community.'"
        ),
    },
    {
        "key": "family",
        "prompt": (
            STYLE +
            "Candid family moment: a warm, joyful young Black African babysitter reading a colorful children's book "
            "with two African children on a soft rug in a bright modern living room. All three completely engaged, "
            "laughing at the story. Natural window light, plants, wooden toys, artistic decor visible. "
            "Real love, real learning. Story: 'trust, joy, and safety for the modern African family.'"
        ),
    },
    {
        "key": "cta",
        "prompt": (
            STYLE +
            "Candid group portrait: three young Black African professionals in their late 20s — a woman entrepreneur, "
            "a male electrician in clean modern workwear, and a chic young female makeup artist — standing side by side, "
            "confident and smiling, warm natural light. Neutral premium beige studio background with subtle texture. "
            "Fashion editorial styling, real diversity of professions. Story: 'the new generation of African talent, "
            "united on one platform.'"
        ),
    },
]


async def generate_one(item: dict):
    key = item["key"]
    out_path = OUT / f"{key}.png"
    if out_path.exists():
        print(f"[skip] {key} already exists")
        return
    print(f"[gen] {key} ... ", flush=True)
    api_key = os.getenv("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY missing in env")
    chat = LlmChat(
        api_key=api_key,
        session_id=f"onboarding-{key}",
        system_message="You generate cinematic editorial photographs.",
    )
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    msg = UserMessage(text=item["prompt"])
    try:
        _text, images = await chat.send_message_multimodal_response(msg)
    except Exception as e:
        print(f"[err] {key}: {e}")
        return
    if not images:
        print(f"[warn] {key}: no images returned")
        return
    img = images[0]
    data = base64.b64decode(img["data"])
    out_path.write_bytes(data)
    print(f"[ok] {key} -> {out_path.name} ({len(data)//1024} KB)")


async def main():
    for item in IMAGES:
        await generate_one(item)


if __name__ == "__main__":
    asyncio.run(main())
