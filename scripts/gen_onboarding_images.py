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
            "A confident young Black African woman entrepreneur in her modern minimalist office, "
            "wearing tailored black blazer, sitting behind a wooden desk with laptop and small plant, "
            "soft warm sunlight streaming through large windows, city skyline blurred in background. "
            "Warm smile, looking slightly off-camera. Pinterest editorial style, Gen Z premium vibe."
        ),
    },
    {
        "key": "services",
        "prompt": (
            STYLE +
            "A stylish young Black African woman hairstylist working in a premium modern hair salon, "
            "styling long braided hair on a client, holding professional tools, wearing chic dark apron. "
            "Salon is bright, minimalist, with pink and gold accents, ring lights, styling chairs, pastel walls. "
            "Focused expression, artistic composition, editorial fashion magazine quality."
        ),
    },
    {
        "key": "mobility",
        "prompt": (
            STYLE +
            "A handsome young Black African delivery courier in stylish modern uniform, "
            "smiling confidently while holding food delivery bag next to his premium scooter, "
            "urban Dakar-style city street, warm sunset, palm trees in background, "
            "vibrant African street scene, professional yet approachable. Turquoise brand accent visible."
        ),
    },
    {
        "key": "family",
        "prompt": (
            STYLE +
            "A warm-hearted young Black African babysitter playing joyfully with two happy African children "
            "in a bright modern living room, natural window light, colorful modern decor, plants, books, "
            "genuine laughter, high-end lifestyle photography, Gen Z premium family aesthetic. "
            "Trust, warmth, professionalism. Editorial magazine composition."
        ),
    },
    {
        "key": "cta",
        "prompt": (
            STYLE +
            "A stunning close-up portrait of a stylish young Black African professional man in his 20s, "
            "wearing modern minimalist beige turtleneck sweater, subtle smile, direct eye contact with camera, "
            "clean beige-cream background with soft studio lighting, editorial fashion vibe. "
            "Ambitious, confident, aspirational. Pinterest premium portrait aesthetic."
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
