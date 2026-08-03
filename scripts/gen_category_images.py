"""Génère les images des catégories Jokoo — version cinématographique Gen Z premium.
Style : Apple × Airbnb × Pinterest × Arc Browser, Sénégal moderne, personnes noires en action.
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

STYLE = (
    "CINEMATIC editorial photograph, portrait 4:5 aspect ratio, PREMIUM Airbnb × Pinterest × Arc Browser "
    "× Vogue Africa aesthetic. Shot on Leica Q3, 35mm f/1.4, extremely shallow depth of field, subject "
    "razor-sharp with dreamy bokeh background. GOLDEN HOUR lighting — warm amber sun rays cutting through "
    "the scene. Modern SENEGAL settings: Dakar Plateau rooftop, Almadies villa, VDN co-working space, "
    "trendy Ngor café, luxury Point E salon. Beautiful young Black Senegalese/African/afro-descendant "
    "subjects in their 20s-30s, GEN Z lifestyle, real emotion caught in motion, unposed candid moment, "
    "modern minimalist urban Dakar. Warm sun flare, atmospheric haze, cinematic mood. Subtle turquoise "
    "brand accent naturally in scene. National Geographic × A24 film still × Kinfolk magazine. "
    "NO camera pose, NO staged smiles, NO stock-photo cliché. "
)

CATEGORIES = [
    ("beauty",    "Elegant Dakar hair salon in Almadies: young Senegalese hairstylist with braided updo, mid-motion applying finishing product to her client seated in modern chair, marble counter, gold-framed mirror, hanging plants, warm golden window light. She's focused on her craft, tools laid out artistically. Instagrammable interior."),
    ("health",    "Modern Dakar clinic: young Black female doctor in cream coat leaning slightly to explain something to a smiling patient, both looking at a tablet. Sun streams through large windows, plants, minimalist medical decor, warm afternoon light."),
    ("home",      "Contemporary Almadies villa: young Senegalese woman housekeeper mid-motion arranging fresh flowers in ceramic vase on marble kitchen counter, sun streaming through floor-to-ceiling windows, plants everywhere, minimal luxe design. Real morning ritual."),
    ("repair",    "Modern Dakar Plateau apartment: young Senegalese electrician in dark denim workwear kneeling to install premium light fixture on exposed brick wall. Tools organized in leather roll on wooden floor. Warm ambient light from vintage bulbs. Real craft in motion."),
    ("transport", "Golden hour on Corniche Ouest Dakar: young Senegalese man leaning coolly against sleek black sedan overlooking ocean, cinematic sun flare, palm silhouettes. Not posing — checking his phone, in his own world. Warm amber sky."),
    ("food",      "Trendy Dakar café in Ngor: young Senegalese chef mid-plating gourmet thieboudienne on ceramic plate, marble table, herbs, colorful ingredients, professional overhead light. Hands blurred with motion, focused eyes."),
    ("events",    "Almadies rooftop wedding setup at golden hour: young Senegalese event designer arranging cascading flowers on wooden banquet table, string lights, candles, elegant African textiles. Ocean view, palm trees, dreamy sunset. She's engrossed in her craft."),
    ("tech",      "Trendy VDN co-working space: young Senegalese software developer on modern MacBook, dual external monitors showing code, plants, minimalist wooden desk, cortado coffee, brass accents, Aeropress on shelf. Warm afternoon light. Focused work, coffee-shop aesthetic."),
    ("education", "Cozy Dakar Plateau library scene: young Senegalese tutor beside a teenage student, both leaning over an open textbook at wooden desk. Warm brass lamp light, books stacked, plants. Real learning moment, focused expressions, no camera awareness."),
    ("kids",      "Sunny Almadies nursery: young Senegalese nanny lifting a giggling African toddler under sunbeam through window, both laughing genuinely. Colorful modern wooden toys, plants, cozy rug. Pure joy captured in motion."),
    ("laundry",   "Modern Dakar Plateau tailoring atelier: young Senegalese seamstress at industrial machine crafting bold ankara dress, colorful fabrics draped, brass sewing kit, cortado coffee nearby, brick wall, plants. Hands blurred, focused eyes."),
    ("moving",    "Dakar street scene: two young Senegalese movers in matching branded polo t-shirts carrying a beautiful wooden mid-century chair from modern branded van into an Almadies villa entrance. Palm trees, golden hour, teamwork, motion, professional energy."),
]


async def generate_one(key: str, subject: str):
    out_path = OUT / f"{key}.png"
    print(f"[gen] {key} ... ", flush=True)
    api_key = os.getenv("EMERGENT_LLM_KEY")
    chat = LlmChat(
        api_key=api_key,
        session_id=f"category-v2-{key}",
        system_message="You generate authentic cinematic African premium documentary photography.",
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
    # Batch of 3 concurrent
    for i in range(0, len(tasks), 3):
        await asyncio.gather(*tasks[i:i+3])


if __name__ == "__main__":
    asyncio.run(main())
