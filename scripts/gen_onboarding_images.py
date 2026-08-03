"""Génère les 5 images héros onboarding — PHOTORÉALISME MAXIMUM.
Style : Documentary photography Airbnb/Uber/Apple, Dakar réel, aucun aspect IA.
"""
import asyncio
import base64
import os
from pathlib import Path

from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

from emergentintegrations.llm.chat import LlmChat, UserMessage

OUT = Path("/app/frontend/assets/onboarding")
OUT.mkdir(parents=True, exist_ok=True)

STYLE = (
    "Shot on Sony A7 IV, 35mm f/1.8 lens, ISO 400, natural available light only. "
    "Documentary lifestyle photography, unstaged, unposed. "
    "Real Senegalese person mid-action captured on the fly — NOT looking at camera, "
    "no eye contact, no fake smile. Natural skin texture with visible pores and small "
    "imperfections. Everyday modest clothing (t-shirt, jeans, simple dress, casual wear). "
    "Realistic modern Dakar setting: Almadies, Ngor, Plateau, Sacré-Cœur, Mamelles, "
    "Mermoz, Ouakam neighborhoods. Real objects, real furniture, lived-in interiors. "
    "Portrait 9:16 vertical composition. Photojournalism style like Airbnb, Uber, Apple ads. "
    "AVOID entirely: plastic skin, artificial faces, deformed hands, cinematic sun flare, "
    "over-saturated colors, staged smiles, luxury cliché, stock photo aesthetics."
)

SLIDES = [
    ("welcome",
        "Interior of a real modern café in Ngor Dakar. Young Senegalese woman in her mid-20s "
        "sitting at a wooden table by a large window, natural morning light on her face. She's "
        "looking down at her smartphone with a soft genuine half-smile. Simple t-shirt, hair "
        "in medium braids. A cortado coffee cup and a small pastry on the table. Other real "
        "customers softly out of focus behind her. Realistic café details: menu board, plants, "
        "hanging pendant lights. She's in her own moment, unaware of the camera."),
    ("services",
        "Real Dakar hair salon in Plateau at afternoon. A Senegalese hairstylist in her 30s "
        "with a colorful head wrap and simple apron is braiding the hair of a seated client. "
        "Her hands mid-motion twisting the braid. Both women focused on the process, not the "
        "camera. Real salon details: bottles of hair products on shelf, mirror with framed "
        "family photos taped on it, another client waiting reading her phone in soft focus. "
        "Natural daylight from the shop window. Believable everyday scene."),
    ("mobility",
        "Real Dakar street scene in Almadies at golden hour. A young Senegalese delivery driver "
        "in a plain branded polo t-shirt is handing a small package to a young woman standing "
        "at the entrance of a modern residential building. Both wearing everyday clothes, "
        "genuine friendly transaction. His delivery scooter parked on the sidewalk in soft "
        "focus. Palm tree, warm terracotta wall, real Dakar street details visible."),
    ("family",
        "Real Dakar living room in Sacré-Cœur neighborhood in afternoon light. A young "
        "Senegalese nanny in her 20s wearing casual clothes sitting cross-legged on a woven "
        "rug with two African children (age 4 and 6), reading them a colorful picture book. "
        "All three deeply focused on the book, nobody looking at camera. Real living-room "
        "details: sofa in soft focus, plants, wooden toys scattered, family photos on a shelf. "
        "Natural window light."),
    ("cta",
        "Real Dakar Plateau rooftop terrace late afternoon. Three young Senegalese people in "
        "their 20s (two women, one man) walking together toward the camera down a corridor "
        "with modern buildings around, laughing and chatting about something one of them just "
        "said. Casual modern clothes — jeans, simple t-shirts, one with a canvas tote. Not "
        "posed, real friendship. Sun setting over Dakar skyline in soft focus behind them. "
        "Motion caught candidly."),
]


async def generate_one(key: str, subject: str):
    out_path = OUT / f"{key}.png"
    print(f"[gen] {key} ... ", flush=True)
    api_key = os.getenv("EMERGENT_LLM_KEY")
    chat = LlmChat(
        api_key=api_key,
        session_id=f"onboarding-doc-v2-{key}",
        system_message=(
            "You produce authentic documentary photography for magazine features. "
            "Every image must be indistinguishable from a real photograph shot by a "
            "professional photographer in Dakar, Senegal. No AI art, no CGI, no plastic look."
        ),
    )
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    try:
        _text, images = await chat.send_message_multimodal_response(UserMessage(text=STYLE + " " + subject))
    except Exception as e:
        print(f"[err] {key}: {e}")
        return
    if not images:
        print(f"[warn] {key}: no images")
        return
    data = base64.b64decode(images[0]["data"])
    out_path.write_bytes(data)
    print(f"[ok] {key} -> {len(data)//1024} KB")


async def main():
    tasks = [generate_one(k, s) for k, s in SLIDES]
    for i in range(0, len(tasks), 3):
        await asyncio.gather(*tasks[i:i+3])


if __name__ == "__main__":
    asyncio.run(main())
