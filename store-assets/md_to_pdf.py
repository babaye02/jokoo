#!/usr/bin/env python3
"""Convert the geographic availability strategy Markdown to a branded HTML,
then render to PDF via Chromium headless."""
import subprocess, re
from pathlib import Path

MD = Path("/app/store-assets/geographic_availability_strategy.md").read_text(encoding="utf-8")
OUT_HTML = Path("/tmp/geo_availability.html")
OUT_PDF = Path("/app/store-assets/geographic_availability_strategy.pdf")

# --- Minimalist Markdown -> HTML converter (headings, lists, tables, bold) ---
def md_to_html(md: str) -> str:
    lines = md.split("\n")
    out = []
    in_table = False
    in_list = False
    table_head = False

    def flush_list():
        nonlocal in_list
        if in_list:
            out.append("</ul>")
            in_list = False

    def flush_table():
        nonlocal in_table, table_head
        if in_table:
            out.append("</tbody></table>")
            in_table = False
            table_head = False

    for line in lines:
        stripped = line.rstrip()
        # Table row
        if re.match(r"^\|.*\|$", stripped):
            cells = [c.strip() for c in stripped.strip("|").split("|")]
            # Header separator row
            if re.match(r"^[\|\s\-:]+$", stripped):
                out.append("</thead><tbody>")
                table_head = True
                continue
            if not in_table:
                out.append('<table><thead>')
                in_table = True
                table_head = False
            tag = "th" if not table_head else "td"
            row = "".join(f"<{tag}>{c}</{tag}>" for c in cells)
            out.append(f"<tr>{row}</tr>")
            continue
        else:
            flush_table()

        # Headings
        h = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if h:
            flush_list()
            level = len(h.group(1))
            content = _inline(h.group(2))
            out.append(f"<h{level}>{content}</h{level}>")
            continue

        # Horizontal rule
        if re.match(r"^-{3,}$", stripped):
            flush_list()
            out.append("<hr>")
            continue

        # List item
        li = re.match(r"^[\-\*]\s+(.*)$", stripped)
        if li:
            if not in_list:
                out.append("<ul>")
                in_list = True
            out.append(f"<li>{_inline(li.group(1))}</li>")
            continue
        else:
            flush_list()

        # Blank line = paragraph break
        if not stripped:
            out.append("")
            continue

        # Regular paragraph
        out.append(f"<p>{_inline(stripped)}</p>")

    flush_list()
    flush_table()
    return "\n".join(out)


def _inline(text: str) -> str:
    # **bold**
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    # `code`
    text = re.sub(r"`(.+?)`", r"<code>\1</code>", text)
    return text


html_body = md_to_html(MD)

HTML = f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Jokoo — Couverture géographique</title>
<style>
  @page {{ size: A4; margin: 20mm 18mm 22mm 18mm; }}
  body {{
    font-family: -apple-system, "Helvetica Neue", "Arial", "Segoe UI", sans-serif;
    color: #1F1F1F;
    line-height: 1.55;
    font-size: 11.5pt;
  }}
  h1, h2, h3, h4 {{ color: #0D9488; margin-top: 1.2em; }}
  h1 {{ font-size: 22pt; border-bottom: 3px solid #18C6A3; padding-bottom: 8px; }}
  h2 {{ font-size: 16pt; color: #18C6A3; margin-top: 1.5em; }}
  h3 {{ font-size: 13pt; color: #1A184C; }}
  strong {{ color: #1A184C; }}
  code {{ background: #F1F5F9; padding: 1px 6px; border-radius: 4px; font-size: 10.5pt; }}
  table {{ width: 100%; border-collapse: collapse; margin: 12px 0; }}
  th {{ background: #18C6A3; color: white; padding: 8px 10px; text-align: left; font-size: 10.5pt; }}
  td {{ border-bottom: 1px solid #E5E7EB; padding: 7px 10px; font-size: 10.5pt; }}
  tr:nth-child(even) td {{ background: #F8FAFC; }}
  ul {{ padding-left: 22px; }}
  li {{ margin: 4px 0; }}
  hr {{ border: none; border-top: 1px solid #E5E7EB; margin: 20px 0; }}
  p {{ margin: 8px 0; }}
  .footer {{
    position: fixed; bottom: -8mm; left: 0; right: 0;
    text-align: center; font-size: 8.5pt; color: #6B7280;
  }}
</style>
</head>
<body>
{html_body}
<div class="footer">Jokoo — Document confidentiel · jokooservices.com · août 2026</div>
</body>
</html>
"""

OUT_HTML.write_text(HTML, encoding="utf-8")
print(f"HTML written ({len(HTML)} chars)")

# --- Render via headless chromium ---
cmd = [
    "/root/bin/chromium",
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--print-to-pdf-no-header",
    f"--print-to-pdf={OUT_PDF}",
    f"file://{OUT_HTML}",
]
result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
print("chromium stderr:", (result.stderr or "")[:400])
if OUT_PDF.exists():
    print(f"✓ PDF generated: {OUT_PDF} ({OUT_PDF.stat().st_size // 1024} KB)")
else:
    print(f"✗ PDF FAILED: {result.returncode}")
