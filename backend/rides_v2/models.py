"""rides_v2.models — Pydantic schemas pour la marketplace covoiturage."""

from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator


# ─── Ride Requests (passenger side) ─────────────────────────────────

class RideRequestIn(BaseModel):
    """Payload envoyé par un passager pour publier une demande."""
    from_city: str = Field(..., min_length=2, max_length=80)
    from_address: Optional[str] = Field(None, max_length=200)
    to_city: str = Field(..., min_length=2, max_length=80)
    to_address: Optional[str] = Field(None, max_length=200)
    date: str = Field(..., description="YYYY-MM-DD (jour du trajet souhaité)")
    time_from: str = Field(..., description="HH:MM (borne basse de la fenêtre)")
    time_to: Optional[str] = Field(None, description="HH:MM (borne haute optionnelle)")
    seats: int = Field(1, ge=1, le=8)
    budget_xof: Optional[int] = Field(None, ge=0, le=1_000_000)
    notes: Optional[str] = Field(None, max_length=500)

    @field_validator("date")
    @classmethod
    def _valid_date(cls, v: str) -> str:
        # YYYY-MM-DD
        try:
            datetime.strptime(v[:10], "%Y-%m-%d")
        except Exception:
            raise ValueError("date must be YYYY-MM-DD")
        return v[:10]

    @field_validator("time_from")
    @classmethod
    def _valid_time_from(cls, v: str) -> str:
        return _validate_hhmm(v)

    @field_validator("time_to")
    @classmethod
    def _valid_time_to(cls, v: Optional[str]) -> Optional[str]:
        return _validate_hhmm(v) if v else None


class RideRequestUpdate(BaseModel):
    """Modifications autorisées sur une demande existante."""
    from_city: Optional[str] = Field(None, min_length=2, max_length=80)
    from_address: Optional[str] = Field(None, max_length=200)
    to_city: Optional[str] = Field(None, min_length=2, max_length=80)
    to_address: Optional[str] = Field(None, max_length=200)
    date: Optional[str] = None
    time_from: Optional[str] = None
    time_to: Optional[str] = None
    seats: Optional[int] = Field(None, ge=1, le=8)
    budget_xof: Optional[int] = Field(None, ge=0, le=1_000_000)
    notes: Optional[str] = Field(None, max_length=500)
    status: Optional[str] = None  # cancelled uniquement (pas les autres)

    @field_validator("date")
    @classmethod
    def _v_date(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return v
        try:
            datetime.strptime(v[:10], "%Y-%m-%d")
        except Exception:
            raise ValueError("date must be YYYY-MM-DD")
        return v[:10]

    @field_validator("time_from", "time_to")
    @classmethod
    def _v_time(cls, v: Optional[str]) -> Optional[str]:
        return _validate_hhmm(v) if v else None


# ─── Ride Offers (driver side) ──────────────────────────────────────

class RideOfferIn(BaseModel):
    """
    Un conducteur envoie une offre en réponse à une demande passager.

    Deux modes :
    - `ride_id`      : le conducteur propose un trajet déjà publié.
    - inline fields  : le conducteur propose sans publier de trajet préalable
                       (from/to/date/time/price/seats).
    """
    ride_id: Optional[str] = None
    price_xof: int = Field(..., ge=0, le=1_000_000)
    message: Optional[str] = Field(None, max_length=500)

    # Inline (si ride_id absent) : champs optionnels du "trajet proposé"
    from_city: Optional[str] = Field(None, max_length=80)
    to_city: Optional[str] = Field(None, max_length=80)
    date: Optional[str] = None
    time: Optional[str] = None
    seats_available: Optional[int] = Field(None, ge=1, le=8)
    vehicle_model: Optional[str] = Field(None, max_length=80)

    @field_validator("date")
    @classmethod
    def _v_date(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return v
        try:
            datetime.strptime(v[:10], "%Y-%m-%d")
        except Exception:
            raise ValueError("date must be YYYY-MM-DD")
        return v[:10]

    @field_validator("time")
    @classmethod
    def _v_time(cls, v: Optional[str]) -> Optional[str]:
        return _validate_hhmm(v) if v else None


class RideOfferDecisionIn(BaseModel):
    """Décision du passager sur une offre reçue."""
    action: str = Field(..., description='"accept" | "refuse"')
    message: Optional[str] = Field(None, max_length=300)

    @field_validator("action")
    @classmethod
    def _v_action(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ("accept", "refuse"):
            raise ValueError("action must be 'accept' or 'refuse'")
        return v


# ─── Helpers ────────────────────────────────────────────────────────

def _validate_hhmm(v: str) -> str:
    """Valide un HH:MM (24h)."""
    v = str(v).strip()
    parts = v.split(":")
    if len(parts) != 2:
        raise ValueError("time must be HH:MM")
    try:
        h = int(parts[0])
        m = int(parts[1])
    except Exception:
        raise ValueError("time must be HH:MM")
    if not (0 <= h < 24 and 0 <= m < 60):
        raise ValueError("time out of range")
    return f"{h:02d}:{m:02d}"
