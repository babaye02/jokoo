"""
Service Email transactionnel unifié pour Jokoo — 2 modes :

1. **Resend autonome** (prod recommandée) — `RESEND_API_KEY=re_...`
   → POST https://api.resend.com/emails
   → Domaine expéditeur configuré chez Resend (SPF/DKIM/DMARC).

2. **Emergent-managed** (par défaut, aucun setup) — `EMERGENT_EMAIL_KEY=ek_...`
   → POST https://integrations.emergentagent.com/api/v1/email/send
   → Domaine géré par la plateforme.

3. **Dev fallback** — aucun des deux ⇒ log console + retour dev_token dans les réponses API.

Priorité : `RESEND_API_KEY` > `EMERGENT_EMAIL_KEY` > mode dev.

Usage :
    from services.emails import send_email, EmailPayload
    ok, email_id = await send_email(EmailPayload(
        to="user@example.com",
        subject="Bienvenue !",
        html="<p>Bonjour</p>",
    ))
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Optional, Tuple

import httpx
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("jokoo.email")

# --- Config ------------------------------------------------------------------
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
EMERGENT_EMAIL_KEY = os.getenv("EMERGENT_EMAIL_KEY", "").strip()
EMAIL_FROM = os.getenv("EMAIL_FROM", "Jokoo <noreply@jokooservices.com>")
EMAIL_FROM_NAME = os.getenv("EMAIL_FROM_NAME", "Jokoo Services")

RESEND_URL = "https://api.resend.com/emails"
EMERGENT_URL = "https://integrations.emergentagent.com/api/v1/email/send"


def _current_mode() -> str:
    if RESEND_API_KEY:
        return "resend"
    if EMERGENT_EMAIL_KEY:
        return "emergent"
    return "dev"


@dataclass
class EmailPayload:
    to: str
    subject: str
    html: str
    text: Optional[str] = None       # fallback text plain
    reply_to: Optional[str] = None   # inbox pour réponses utilisateur


async def send_email(payload: EmailPayload) -> Tuple[bool, Optional[str]]:
    """
    Envoie un email. Ne bloque JAMAIS le flow métier :
      - En mode dev, log et retourne (True, None).
      - En cas d'erreur API, log et retourne (False, None) — l'appelant peut
        décider de continuer sans échouer côté user.
    """
    mode = _current_mode()

    if mode == "dev":
        logger.warning(
            "[email:DEV] to=%s subject=%r (aucune clé configurée — pas d'envoi réel)",
            payload.to, payload.subject,
        )
        return (True, None)

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            if mode == "resend":
                body = {
                    "from": EMAIL_FROM,
                    "to": [payload.to],
                    "subject": payload.subject,
                    "html": payload.html,
                }
                if payload.text:
                    body["text"] = payload.text
                if payload.reply_to:
                    body["reply_to"] = [payload.reply_to]
                resp = await client.post(
                    RESEND_URL,
                    headers={
                        "Authorization": f"Bearer {RESEND_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                )
            else:  # emergent
                body = {
                    "to": [payload.to],
                    "subject": payload.subject,
                    "html": payload.html,
                    "from_name": EMAIL_FROM_NAME,
                }
                if payload.reply_to:
                    body["contact_email"] = payload.reply_to
                resp = await client.post(
                    EMERGENT_URL,
                    headers={"X-Email-Key": EMERGENT_EMAIL_KEY},
                    json=body,
                )
        resp.raise_for_status()
        data = resp.json() if resp.text else {}
        eid = data.get("id")
        logger.info("[email:%s] sent to=%s id=%s", mode, payload.to, eid)
        return (True, eid)

    except httpx.HTTPStatusError as e:
        logger.error(
            "[email:%s] fail status=%s body=%s to=%s",
            mode, e.response.status_code, e.response.text[:200], payload.to,
        )
        return (False, None)
    except Exception as e:
        logger.exception("[email:%s] exception to=%s: %s", mode, payload.to, e)
        return (False, None)


# ─── Templates prêts à l'emploi ──────────────────────────────────────────────

_BASE_HTML = """
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0F172A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 14px rgba(15,23,42,0.06);">
        <tr><td style="background:linear-gradient(135deg,#00C2A8,#0EA5E9);padding:32px 32px 24px;text-align:center;">
          <div style="color:#FFFFFF;font-size:28px;font-weight:800;letter-spacing:-0.5px;">Jokoo</div>
          <div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:4px;">Services · Sénégal</div>
        </td></tr>
        <tr><td style="padding:32px;">{body}</td></tr>
        <tr><td style="padding:16px 32px 28px;text-align:center;border-top:1px solid #E2E8F0;color:#64748B;font-size:12px;line-height:18px;">
          © 2026 Jokoo Services · <a href="https://jokooservices.com" style="color:#00C2A8;text-decoration:none;">jokooservices.com</a><br>
          Vous recevez cet email suite à une action sur votre compte Jokoo.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
"""


def _wrap(inner_html: str) -> str:
    return _BASE_HTML.format(body=inner_html)


def tpl_welcome(name: str) -> tuple[str, str]:
    subject = "Bienvenue sur Jokoo 👋"
    inner = f"""
      <h1 style="margin:0 0 16px;font-size:22px;">Bienvenue {name} !</h1>
      <p style="margin:0 0 12px;font-size:15px;line-height:24px;color:#334155;">
        Votre compte Jokoo est prêt. Trouvez un prestataire de confiance, réservez en 30 secondes et payez en toute sécurité.
      </p>
      <p style="margin:24px 0 8px;">
        <a href="https://jokooservices.com" style="display:inline-block;background:#00C2A8;color:#FFF;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;">Découvrir Jokoo</a>
      </p>
      <p style="margin:16px 0 0;font-size:13px;color:#64748B;">Besoin d'aide ? Répondez à cet email, notre équipe est là.</p>
    """
    return subject, _wrap(inner)


def tpl_reset_password(reset_link: str) -> tuple[str, str]:
    subject = "Réinitialisez votre mot de passe Jokoo"
    inner = f"""
      <h1 style="margin:0 0 16px;font-size:22px;">Mot de passe oublié ?</h1>
      <p style="margin:0 0 12px;font-size:15px;line-height:24px;color:#334155;">
        Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe. Ce lien est valable <strong>60 minutes</strong>.
      </p>
      <p style="margin:24px 0;">
        <a href="{reset_link}" style="display:inline-block;background:#00C2A8;color:#FFF;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;">Réinitialiser mon mot de passe</a>
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#64748B;word-break:break-all;">Ou copiez ce lien : {reset_link}</p>
      <p style="margin:16px 0 0;font-size:13px;color:#64748B;">Vous n'êtes pas à l'origine de cette demande ? Ignorez cet email, aucun changement ne sera fait.</p>
    """
    return subject, _wrap(inner)


def tpl_otp(code: str) -> tuple[str, str]:
    subject = f"Votre code Jokoo : {code}"
    inner = f"""
      <h1 style="margin:0 0 16px;font-size:22px;">Votre code de vérification</h1>
      <div style="margin:24px 0;font-size:36px;font-weight:800;letter-spacing:6px;color:#00C2A8;text-align:center;padding:20px;background:#F0FDFA;border-radius:12px;">
        {code}
      </div>
      <p style="margin:0 0 12px;font-size:14px;color:#334155;">Ce code est valable <strong>5 minutes</strong>. Ne le partagez avec personne.</p>
    """
    return subject, _wrap(inner)


def tpl_booking_confirmed(*, provider_name: str, date: str, time: str, address: str, price_label: str) -> tuple[str, str]:
    subject = f"Réservation confirmée avec {provider_name}"
    inner = f"""
      <h1 style="margin:0 0 16px;font-size:22px;">C'est confirmé ✅</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#334155;">
        Votre réservation avec <strong>{provider_name}</strong> est confirmée.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;border-radius:12px;padding:16px;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#64748B;font-size:13px;">Date</td><td style="padding:6px 0;text-align:right;font-weight:600;">{date} · {time}</td></tr>
        <tr><td style="padding:6px 0;color:#64748B;font-size:13px;">Adresse</td><td style="padding:6px 0;text-align:right;font-weight:600;">{address}</td></tr>
        <tr><td style="padding:6px 0;color:#64748B;font-size:13px;">Tarif</td><td style="padding:6px 0;text-align:right;font-weight:600;">{price_label}</td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:13px;color:#64748B;">Retrouvez tous les détails et discutez avec le prestataire dans l'app.</p>
    """
    return subject, _wrap(inner)


def tpl_booking_new_for_provider(*, client_name: str, service: str, date: str, time: str) -> tuple[str, str]:
    subject = f"Nouvelle demande de {client_name}"
    inner = f"""
      <h1 style="margin:0 0 16px;font-size:22px;">Nouvelle réservation 🎯</h1>
      <p style="margin:0 0 12px;font-size:15px;line-height:24px;color:#334155;">
        <strong>{client_name}</strong> vient de vous réserver pour <strong>{service}</strong>.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;border-radius:12px;padding:16px;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#64748B;font-size:13px;">Prestation</td><td style="padding:6px 0;text-align:right;font-weight:600;">{service}</td></tr>
        <tr><td style="padding:6px 0;color:#64748B;font-size:13px;">Date</td><td style="padding:6px 0;text-align:right;font-weight:600;">{date} · {time}</td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:13px;color:#64748B;">Ouvrez l'app pour confirmer ou proposer un nouveau créneau.</p>
    """
    return subject, _wrap(inner)
