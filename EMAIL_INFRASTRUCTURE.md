# 📧 Infrastructure Emails — Jokoo Services

**Domaine :** `jokooservices.com` (pointé chez votre registrar → MX Google Workspace).

Cette infrastructure est **entièrement pilotée par le CMS admin** (`/admin/company-info` → onglet Emails). Toute modification est répercutée automatiquement dans les emails envoyés + les mentions légales + les pages publiques du site.

---

## 🎯 12 boîtes principales à créer

| # | Adresse | Rôle | Utilisation applicative | Réponses attendues | Redondance | Priorité |
|---|---------|------|--------------------------|--------------------|------------|----------|
| 1 | `noreply@jokooservices.com` | Expéditeur transactionnel | Envoyeur par défaut de tous les emails automatiques (confirmations, OTP, reset password, notifications) | Aucune (bounce) | Non | **P0** |
| 2 | `support@jokooservices.com` | Support utilisateur principal | Reply-to par défaut · FAQ · contact in-app · signalements généraux | 7j/7 · sous 24h | Alias vers équipe support | **P0** |
| 3 | `contact@jokooservices.com` | Point de contact général | Formulaire de contact site web · relations publiques légères · presse basique | 5j/7 · sous 48h | Alias vers support | **P0** |
| 4 | `legal@jokooservices.com` | Affaires juridiques | Litiges · appels de sanctions · demandes autorités · CGU/RGPD | 5j/7 · sous 72h | 1 juriste + backup | **P0** |
| 5 | `dpo@jokooservices.com` | Délégué protection des données (RGPD/Loi 2008-12) | Demandes d'accès/suppression données · plaintes RGPD · CDP Sénégal | 5j/7 · sous 30 jours max | DPO nommé | **P0** (obligatoire loi) |
| 6 | `paiements@jokooservices.com` | Support paiements & remboursements | Litiges paiements · escrow · remboursements · Wave/OM/carte | 7j/7 · sous 48h | 1 support finance | **P0** |
| 7 | `verification@jokooservices.com` | Vérification identité (KYC) | Appels de refus KYC · re-vérifications · fraude d'identité | 5j/7 · sous 72h | Équipe modération | **P1** |
| 8 | `prestataires@jokooservices.com` | Support prestataires (Pro) | Onboarding · questions Jokoo Pro · sponsorisations · devis | 6j/7 · sous 24h | Équipe partenariats | **P1** |
| 9 | `security@jokooservices.com` | Sécurité informatique / responsible disclosure | Faille de sécurité · alertes techniques externes | 7j/7 · sous 48h | CTO/lead dev | **P1** |
| 10 | `fraude@jokooservices.com` | Signalement fraude et abus | Utilisateurs signalant escroquerie · comportement suspect | 7j/7 · sous 24h | Alias vers legal + support | **P1** |
| 11 | `family@jokooservices.com` | Support Jokoo Family (baby-sitting, tutorat) | Urgences bouton SOS · incidents Family · escalade rapide | **24h/24 en urgence** (astreinte) | Équipe modération Family | **P1** |
| 12 | `press@jokooservices.com` | Presse & relations médias | Journalistes · interviews · communiqués | 5j/7 · sous 5 jours | Direction / PR | **P2** |

---

## 🔄 Boîtes équipe (facultatives — recommandées à terme)

| Adresse | Rôle |
|---------|------|
| `direction@jokooservices.com` | Direction générale (adresse interne) |
| `finance@jokooservices.com` | Comptabilité, factures fournisseurs, TVA |
| `rh@jokooservices.com` | Recrutements, ressources humaines |
| `tech@jokooservices.com` | Alerts monitoring, ops (rejoint `security@`) |
| `marketing@jokooservices.com` | Équipe marketing / croissance |
| `admin@jokooservices.com` | Compte admin Google Workspace |

---

## 👥 Boîtes nominatives (dès embauche)

Format standard : `prénom@jokooservices.com` (ex : `mamadou@jokooservices.com`, `aminata@jokooservices.com`).

Ne PAS créer avant d'avoir la personne — c'est de l'espace occupé et une surface d'attaque supplémentaire.

---

## ✉️ Alias techniques (0€ chez Google Workspace)

| Alias | Redirige vers | Usage |
|-------|--------------|-------|
| `hello@jokooservices.com` | `contact@` | Homepage / marketing |
| `bonjour@jokooservices.com` | `contact@` | Alternative FR |
| `info@jokooservices.com` | `contact@` | Redirection standard |
| `help@jokooservices.com` | `support@` | Anglais |
| `aide@jokooservices.com` | `support@` | Alternative FR |
| `postmaster@jokooservices.com` | `admin@` | Obligatoire RFC pour bouncer |
| `abuse@jokooservices.com` | `security@` | Obligatoire RFC (spam/abuse reports) |
| `webmaster@jokooservices.com` | `tech@` | RFC classique |
| `hostmaster@jokooservices.com` | `tech@` | RFC classique |

---

## ✍️ Signatures professionnelles (HTML)

### Signature générique support

```html
<div style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#0F172A;font-size:14px;line-height:20px;">
  <strong style="color:#00C2A8;font-size:16px;">Équipe Jokoo</strong><br>
  <span style="color:#64748B;">Support utilisateur</span><br><br>
  📧 <a href="mailto:support@jokooservices.com" style="color:#00C2A8;text-decoration:none;">support@jokooservices.com</a><br>
  🌐 <a href="https://jokooservices.com" style="color:#00C2A8;text-decoration:none;">jokooservices.com</a><br>
  📱 <a href="https://apps.apple.com/…" style="color:#00C2A8;text-decoration:none;">iOS</a> · <a href="https://play.google.com/…" style="color:#00C2A8;text-decoration:none;">Android</a><br><br>
  <span style="color:#94A3B8;font-size:12px;">Jokoo Services · Dakar, Sénégal · <a href="https://jokooservices.com/mentions-legales" style="color:#94A3B8;">Mentions légales</a></span>
</div>
```

### Signature nominative (pour équipe)

```html
<div style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#0F172A;font-size:14px;line-height:20px;">
  <strong style="font-size:16px;">Prénom Nom</strong><br>
  <span style="color:#64748B;">Poste · Jokoo Services</span><br><br>
  📧 <a href="mailto:prenom@jokooservices.com" style="color:#00C2A8;text-decoration:none;">prenom@jokooservices.com</a><br>
  📞 +221 XX XXX XX XX<br>
  🌐 <a href="https://jokooservices.com" style="color:#00C2A8;text-decoration:none;">jokooservices.com</a><br><br>
  <img src="https://res.cloudinary.com/…/jokoo-logo-signature.png" alt="Jokoo" height="32" style="border:0;"><br>
  <span style="color:#94A3B8;font-size:12px;">Ce message peut contenir des informations confidentielles.</span>
</div>
```

### Signature DPO (obligation RGPD)

```html
<div style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#0F172A;font-size:14px;line-height:20px;">
  <strong>Délégué à la Protection des Données · Jokoo Services</strong><br>
  📧 <a href="mailto:dpo@jokooservices.com" style="color:#00C2A8;text-decoration:none;">dpo@jokooservices.com</a><br>
  <span style="color:#64748B;font-size:12px;">Loi 2008-12 (Sénégal) · CDP Sénégal · RGPD</span><br><br>
  Ce message et ses pièces jointes sont confidentiels. Si vous n'êtes pas le destinataire, merci de le détruire et d'en informer l'expéditeur.
</div>
```

---

## 📄 Modèles d'emails de référence

Les templates HTML sont déjà dans `/app/backend/services/emails.py` (`tpl_welcome`, `tpl_reset_password`, `tpl_otp`, `tpl_booking_confirmed`, `tpl_booking_new_for_provider`).

À ajouter ultérieurement (backlog Phase 2 mails) :
- `tpl_kyc_approved` / `tpl_kyc_rejected`
- `tpl_payment_received`
- `tpl_sponsorship_activated`
- `tpl_promo_code_new`
- `tpl_monthly_summary` (récap mensuel prestataire)

Chaque template a un **reply-to** dynamique :
- Emails support/notifications → `reply_to = support@jokooservices.com`
- Emails paiements → `reply_to = paiements@jokooservices.com`
- Emails KYC → `reply_to = verification@jokooservices.com`

---

## 🔐 DNS & authentification (obligatoire avant envoi prod)

Configuration à effectuer chez votre registrar (Bookmyname, Namecheap, OVH, etc.) :

### 1. Enregistrements MX (Google Workspace)

```
Priorité 1  → smtp.google.com
```
(Un seul enregistrement suffit depuis 2023, remplace les 5 anciens.)

### 2. SPF (protection anti-spam)

```
Type : TXT
Nom  : @
Val  : v=spf1 include:_spf.google.com include:resend.com ~all
```

### 3. DKIM (Google)

Depuis Google Admin → Apps → Google Workspace → Gmail → Authentifier l'e-mail → **Générer un enregistrement DKIM** (2048 bits) → copier dans DNS.

### 4. DKIM (Resend — pour vos emails transactionnels)

Ajouter les 3 CNAME fournis par Resend Console → Domains → `jokooservices.com`.

### 5. DMARC (essentiel App Store / Play Store)

```
Type : TXT
Nom  : _dmarc
Val  : v=DMARC1; p=quarantine; rua=mailto:dmarc@jokooservices.com; ruf=mailto:dmarc@jokooservices.com; adkim=r; aspf=r; pct=100; sp=quarantine
```

Créer aussi `dmarc@` (alias vers `security@`).

### 6. BIMI (facultatif, ajoute logo dans Gmail/Yahoo)

```
Type : TXT
Nom  : default._bimi
Val  : v=BIMI1; l=https://jokooservices.com/logo.svg; a=https://jokooservices.com/vmc.pem
```
Nécessite un VMC (Verified Mark Certificate) — 1 500 USD/an chez Entrust ou DigiCert. **Facultatif MVP.**

---

## 📋 CSV prêt à importer dans Google Workspace

Voir `/app/GOOGLE_WORKSPACE_MAILBOXES.csv` — 12 utilisateurs + 9 alias, prêts à importer via **Admin Console → Utilisateurs → Importer**.

---

## 💰 Coût estimatif (Google Workspace Business Starter)

- 6 EUR HT / utilisateur / mois = 72 EUR pour 12 boîtes
- **Aliases illimités gratuits**
- Stockage 30 Go / boîte
- Support 24/7 inclus

Alternative moins chère : **Zoho Mail Free** (5 utilisateurs gratuits jusqu'à 5 Go) — parfait pour démarrer, migration vers Google plus tard.

---

## 🚀 Checklist de mise en route

- [ ] Acheter/renouveler le domaine `jokooservices.com`.
- [ ] Souscrire Google Workspace Business Starter.
- [ ] Configurer les enregistrements MX/SPF/DKIM/DMARC.
- [ ] Importer le CSV `GOOGLE_WORKSPACE_MAILBOXES.csv`.
- [ ] Configurer les alias (postmaster/abuse/webmaster/hello/help).
- [ ] Créer les signatures HTML via Admin Console → Gmail → **Confiance et conformité → Signature globale**.
- [ ] Souscrire un compte Resend (transactionnel) → vérifier le domaine → obtenir la clé.
- [ ] Renseigner **`RESEND_API_KEY`** dans `backend/.env`.
- [ ] Renseigner les 12 adresses dans `/admin/company-info → Emails`.
- [ ] Envoyer un email test depuis chaque boîte pour vérifier SPF/DKIM.
- [ ] Vérifier sur [mail-tester.com](https://www.mail-tester.com) que le score = 10/10.

---

_Document généré automatiquement par l'audit infrastructure Jokoo — 2026-08-04._
