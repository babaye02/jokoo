"""Génère les images des catégories Jokoo — style REPORTAGE DOCUMENTAIRE PHOTORÉALISTE.
Objectif : indiscernable d'une vraie photographie professionnelle. ZÉRO look IA.
Inspiration : campagnes publicitaires Airbnb, Uber, Apple Today, Notion, Stripe.
"""
import asyncio
import base64
import os
from pathlib import Path

from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

from emergentintegrations.llm.chat import LlmChat, UserMessage

OUT = Path("/app/frontend/assets/categories")
OUT.mkdir(parents=True, exist_ok=True)

# Style DOCUMENTAIRE — vocabulaire photographique réaliste (pas de vocabulaire IA)
STYLE = (
    "Shot on Sony A7 IV, 35mm f/2.0 lens, documentary reportage photography, "
    "candid moment captured naturally, real Senegalese person mid-action, "
    "NOT looking at camera, no posing, no staged smile. "
    "Natural daylight through windows, soft even lighting, realistic colors, "
    "authentic modern Senegalese setting (Dakar Plateau, Almadies, VDN, Ngor). "
    "Real skin texture with natural imperfections, natural hair, everyday modest clothing. "
    "Slight motion blur on hands where working. Photojournalism style. "
    "Portrait 4:5 aspect ratio. Clean but lived-in interior, real objects, real tools. "
    "Editorial photography for Airbnb/Uber/Apple Today magazine feature. "
    "AVOID: plastic-looking skin, artificial eyes, perfect faces, cinematic sun flares, "
    "over-saturated colors, staged compositions, deformed hands, unnatural backgrounds. "
)

CATEGORIES = [
    ("beauty",
        "Real Dakar hair salon interior. A Senegalese hairdresser in her 30s wearing a simple black apron "
        "over a t-shirt is braiding a client's hair. She's focused on her hands, not the camera. Other female "
        "clients wait naturally in the background, one reading her phone. Salon has beige walls, mirrors with "
        "framed hairstyles pictures, styling products on a shelf, floor with hair strands here and there. "
        "Warm daylight from a side window. Candid working moment."),
    ("health",
        "A Senegalese nurse in her late 20s wearing a plain white nursing tunic is measuring blood pressure "
        "on the arm of an elderly African patient sitting on an exam chair. She's looking at the equipment, "
        "concentrated. Simple modern clinic room in Dakar with white walls, a poster, medical cabinet. "
        "Natural window light. Real working moment, no eye contact with camera."),
    ("home",
        "A Senegalese cleaner in her 30s wearing simple denim jeans and a plain apron is wiping a large "
        "living-room window in a bright modern Almadies apartment. Behind the window: Dakar rooftops and "
        "palm trees visible in soft focus. She's mid-motion, focused on the window. Wooden floor, minimal "
        "modern furniture (sofa, plants). Natural afternoon daylight."),
    ("repair",
        "A Senegalese electrician in his 30s wearing a plain navy work shirt and jeans is standing on a small "
        "ladder installing a modern pendant light in a bright living room. His tool belt on. He's reaching up, "
        "focused on the wires, real hands. Plain white walls, a wooden coffee table, a sofa visible. Natural "
        "daylight through the window. Candid work in progress."),
    ("transport",
        "A young Senegalese delivery driver in his 20s wearing a simple branded polo shirt is handing a wrapped "
        "package to a smiling young woman at the door of her modern Dakar residence. Both natural expressions, "
        "genuine friendly transaction. His electric scooter parked in soft focus behind. Warm afternoon sun. "
        "Terracotta wall, plants near the door."),
    ("food",
        "A Senegalese chef in her 30s wearing a plain white chef jacket is plating grilled fish with vegetables "
        "on a ceramic dish in the kitchen of a small modern Dakar restaurant. Her hands are in motion, arranging "
        "ingredients. Steam rising. Simple stainless kitchen counter, herbs in a jar, ingredients around. "
        "Natural overhead light. Real cooking moment."),
    ("events",
        "A Senegalese wedding decorator in her 30s wearing casual jeans and a plain t-shirt is arranging fresh "
        "white flowers on a long banquet table in an outdoor Dakar garden setting. Late afternoon sun casting "
        "soft shadows. She's leaning over, focused on the arrangement. Wooden chairs around, other decorations "
        "half done in the background. Candid working shot."),
    ("tech",
        "A Senegalese software developer in his late 20s wearing casual t-shirt is typing on a MacBook Pro at "
        "a wooden desk in a modern Dakar co-working space. Second monitor showing code. He's focused on the "
        "screen, not the camera. Coffee cup nearby, plants, other coworkers blurred in background. Natural "
        "daylight through large windows. Everyday work moment."),
    ("education",
        "A Senegalese tutor in her late 20s wearing a simple sweater is sitting beside a teenage student at a "
        "wooden desk in a calm home study room in Dakar. They're both looking at an open notebook, her finger "
        "pointing at a math problem. Books stacked, a laptop, a lamp. Natural window light. Real learning moment."),
    ("kids",
        "A Senegalese nanny in her 20s wearing casual clothes is sitting cross-legged on a rug reading a "
        "picture book to two African children who are leaning in curiously. Bright modern Dakar living room "
        "with toys on the floor, plants. Everyone focused on the book. Natural window light. Candid family "
        "moment, no camera awareness."),
    ("laundry",
        "A Senegalese seamstress in her 30s wearing a plain apron is sitting at an industrial sewing machine "
        "in a small modest Dakar tailoring workshop, guiding colorful ankara fabric under the needle. Her hands "
        "focused, foot on pedal. Rolls of fabric and threads on shelves behind. Natural daylight from a window. "
        "Real everyday work moment."),
    ("moving",
        "Two young Senegalese movers in their 20s wearing simple matching branded polo t-shirts are carefully "
        "carrying a wooden dining chair down the sidewalk toward a modern Dakar apartment building entrance. "
        "Their branded van is parked in soft focus behind. Warm afternoon light. Palm trees. Teamwork in motion, "
        "focused expressions, no camera pose."),
]


async def generate_one(key: str, subject: str):
    out_path = OUT / f"{key}.png"
    print(f"[gen] {key} ... ", flush=True)
    api_key = os.getenv("EMERGENT_LLM_KEY")
    chat = LlmChat(
        api_key=api_key,
        session_id=f"category-doc-{key}",
        system_message="You produce authentic documentary photography, not AI art. Every image must look like it was shot by a real photographer for a magazine feature.",
    )
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    try:
        _text, images = await chat.send_message_multimodal_response(UserMessage(text=STYLE + subject))
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
    tasks = [generate_one(k, s) for k, s in CATEGORIES]
    for i in range(0, len(tasks), 3):
        await asyncio.gather(*tasks[i:i+3])


if __name__ == "__main__":
    asyncio.run(main())
