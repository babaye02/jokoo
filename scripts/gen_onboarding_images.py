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
    "Authentic documentary photograph, portrait orientation 9:16 vertical composition, "
    "premium photojournalism style capturing real everyday Senegalese life, "
    "natural lighting, unposed candid moment caught in action, "
    "shallow depth of field, National Geographic × Pinterest aesthetic. "
    "Real Senegalese people in motion — no posing for camera. "
    "Warm West African color palette with turquoise brand accents. "
    "Modern Senegal urban vibes (Dakar, Saint-Louis), contemporary African elegance. "
)

IMAGES = [
    {
        "key": "welcome",
        "prompt": (
            STYLE +
            "Authentic scene: a young Senegalese woman in her 20s in a modern Dakar café mid-motion, "
            "genuinely laughing while looking at her phone, headwrap or braided hair, colorful modern outfit. "
            "Real morning routine, croissant and coffee visible, other Senegalese customers blurred in background. "
            "Story: daily life meets modern service. Absolutely no eye contact with camera."
        ),
    },
    {
        "key": "services",
        "prompt": (
            STYLE +
            "Authentic Dakar hair salon scene: young Senegalese hairstylist in motion braiding intricate cornrows "
            "on a client seated in vintage salon chair, both fully absorbed in the process. Hands blurred in movement, "
            "focused eyes on hair, real concentration. Salon walls painted vibrant colors, styling tools scattered "
            "on counter, natural window light streaming in, other clients waiting in background. "
            "Real Senegalese hair artistry in action. Zero posing."
        ),
    },
    {
        "key": "mobility",
        "prompt": (
            STYLE +
            "Authentic Dakar street scene: young Senegalese delivery courier riding his branded scooter through "
            "busy Sandaga market street, motion blur on wheels, warm morning light, colorful market stalls, "
            "palm trees, other vendors and pedestrians. He's focused on the road, not the camera. "
            "Real Dakar hustle, real African urban energy captured mid-ride."
        ),
    },
    {
        "key": "family",
        "prompt": (
            STYLE +
            "Authentic Senegalese home scene: young Senegalese nanny in a bright Dakar living room, kneeling on "
            "traditional woven rug, helping a small African child put together a wooden puzzle. Both completely "
            "absorbed in the task, real concentration, child's tiny hands visible. Warm afternoon light through "
            "shutters, African textiles and plants in room, everyday moment of trust and learning. Zero posing."
        ),
    },
    {
        "key": "cta",
        "prompt": (
            STYLE +
            "Authentic Dakar rooftop scene at golden hour: three young Senegalese professionals in casual modern "
            "workwear (a woman in colorful modern boubou dress with laptop, a man in denim jacket with toolbox, "
            "a young hairstylist with kit) walking together laughing on their way to work. Warm sunset, Dakar city "
            "skyline visible behind. Real friendship, real hustle, absolutely no camera pose. Motion, life, energy."
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
