# 07 — 50 usages de l'IA pour automatiser Jokoo et réduire les coûts

> Classés par fonction. [✓] = brique déjà présente dans le code (Whisper, LLM via
> clé universelle, pipeline anti-contournement, Cloudinary). Prioriser ce qui
> remplace des heures humaines de support/modération.

## Support client (le poste de coût n°1 d'une marketplace)
1. Chatbot support niveau 1 en français ET wolof (réponses FAQ, statut de mission).
2. Résumé automatique d'une conversation client↔pro pour l'agent qui reprend un litige.
3. Classification automatique des tickets (paiement / qualité / fraude / bug).
4. Suggestions de réponse pour les agents (draft à valider).
5. Détection de colère/urgence dans les messages → priorisation de la file.
6. Réponses vocales automatiques (TTS) pour les utilisateurs non-lecteurs.
7. Auto-résolution des demandes « où est mon remboursement » (lecture du ledger wallet).

## Modération & fraude
8. **Transcription Whisper des notes vocales → filtre anti-contournement** [✓ pipeline texte existant — chantier prioritaire].
9. Détection de numéros de téléphone « déguisés » (sept-sept-un-deux…) par LLM.
10. Scoring de risque prestataire (multi-comptes, patterns de non-déclaration cash).
11. Détection d'avis frauduleux (échanges d'avis croisés, textes générés).
12. Vérification KYC assistée : cohérence pièce ↔ selfie ↔ nom saisi.
13. Modération d'images (photos de profil/mission inappropriées).
14. Détection d'annonces de services interdits.
15. Analyse des litiges : recommandation de verdict basée sur l'historique des deux parties.

## Matching & recherche
16. Recherche en langage naturel : « fuite sous l'évier » → plombier + urgence.
17. Recherche vocale en wolof [✓ Whisper].
18. Ranking personnalisé des pros (distance, taux de réponse, affinité de prix).
19. Prédiction du taux d'acceptation d'une demande de mobilité avant publication.
20. Suggestion de prix pour une demande (« budget conseillé : 2 000-2 500 F »).
21. Détection de doublons de catégories/suggestions de services [✓ file admin existante].
22. Matching colis ↔ trajets existants par compréhension des adresses libres.

## Productivité des prestataires
23. Génération de bio professionnelle à partir de 3 questions vocales.
24. Amélioration automatique des photos de profil/portfolio (recadrage, éclairage).
25. Réponses rapides intelligentes contextuelles (le chat a déjà des quick replies statiques [✓]).
26. Devis assisté : description du problème → liste de fournitures + fourchette.
27. Rappels intelligents (« vous n'avez pas répondu à 2 demandes, votre score baisse »).
28. Traduction FR↔wolof des messages en temps réel.
29. Coach IA mensuel : « ajoutez 2 photos, répondez < 1 h → +30 % de missions ».

## Opérations internes
30. Anti-ghost intelligent : génération automatique des trajets Jokoo Vérifié selon les demandes non servies [✓ dashboard mobilité fournit déjà les données].
31. Prévision de demande par commune/catégorie (allouer les campagnes terrain).
32. Digest quotidien auto du Cockpit CEO envoyé sur WhatsApp/email du fondateur.
33. Détection d'anomalies sur les KPIs (chute du matching, pic d'annulations).
34. Génération des rapports hebdo investisseurs.
35. Priorisation automatique de la file KYC (risque × valeur du pro).
36. Nettoyage/normalisation des adresses libres (quartiers Dakar).
37. Catégorisation automatique des dépenses serveur vs usage (FinOps).

## Marketing & contenu
38. Génération des visuels avant/après watermarkés (partage social).
39. Rédaction des posts TikTok/WhatsApp en wolof à partir des missions réelles.
40. Segmentation churn : qui relancer, avec quel message, à quelle heure [✓ push CRM].
41. A/B testing automatique des notifications (bandit multi-bras).
42. Réponses automatiques aux avis Play Store/App Store.
43. SEO programmatique du site Next.js : pages « plombier à {commune} » générées [✓ site existe].
44. Traduction du site en wolof/anglais.

## Voix & accessibilité (différenciateur Sénégal)
45. Assistant vocal complet : réserver une mission en parlant wolof.
46. Lecture audio des profils et avis (TTS) pour non-lecteurs.
47. IVR intelligent : un numéro à appeler, l'IA crée la demande dans l'app.
48. Notes vocales résumées en texte pour le destinataire pressé [✓ vocaux livrés].

## Long terme
49. Estimation photo : photo de la panne → diagnostic + prix probable.
50. Jumeau de demande : re-réservation en 1 tap prédite (« votre ménage bimensuel ? »).

## Top 5 par ROI immédiat
1. #8 Transcription anti-fraude des vocaux (protège la commission)
2. #1 Chatbot support FR/wolof (économise le 1er salaire support)
3. #16+#17 Recherche naturelle + vocale (activation)
4. #30 Anti-ghost intelligent (marketplace liquide sans ops)
5. #29 Coach pro (augmente l'offre de qualité sans account managers)
