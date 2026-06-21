# Soumission à la revue Meta — E-services Tirage

Tout ce qu'il faut pour la revue de l'app, prêt à copier-coller.
À faire **après** que la vérification d'entreprise soit validée.

---

## A. Avant de soumettre (réglages app)

1. **Paramètres → De base** :
   - Politique de confidentialité : `https://tirage.e-services-kouba.com/privacy.html`
   - Suppression des données : `https://tirage.e-services-kouba.com/data-deletion.html`
   - Domaines de l'app : `tirage.e-services-kouba.com`
   - Icône 1024×1024 + Catégorie « Réseaux sociaux »
2. **Facebook Login for Business → Paramètres** :
   - URI de redirection OAuth valides : `https://tirage.e-services-kouba.com/auth/facebook/callback`
3. Passer l'app en mode **« Live »** (interrupteur en haut).

---

## B. Permissions à demander + justification (à coller)

### pages_show_list
> Notre application permet à l'utilisateur de choisir, parmi les Pages Facebook qu'il administre, celle qui contient la publication de son concours. Nous utilisons pages_show_list uniquement pour afficher à l'utilisateur la liste de ses propres Pages afin qu'il en sélectionne une. Aucune donnée n'est stockée.

### pages_read_engagement
> Après que l'utilisateur a choisi une de ses Pages puis une de ses publications, nous lisons les commentaires de cette publication pour constituer la liste des participants à un tirage au sort. pages_read_engagement sert exclusivement à lire les commentaires (nom et texte) de la publication sélectionnée par l'utilisateur sur sa propre Page.

### instagram_basic
> Nous utilisons instagram_basic pour identifier le compte Instagram professionnel lié à la Page Facebook de l'utilisateur et afficher ses publications, afin qu'il puisse en choisir une pour le tirage au sort.

### instagram_manage_comments
> Après sélection d'une publication Instagram de l'utilisateur, nous lisons ses commentaires (nom d'utilisateur et texte) pour constituer la liste des participants au tirage. Nous ne publions, ne modifions ni ne supprimons aucun commentaire — lecture seule.

---

## C. Scénario de la vidéo de démonstration (obligatoire)

Filmer l'écran en montrant, sur le site en ligne :
1. Page d'accueil `https://tirage.e-services-kouba.com`
2. Clic sur « Se connecter avec Facebook »
3. Écran de connexion Facebook + autorisation des permissions
4. Retour sur l'app : la liste des Pages s'affiche → on en choisit une
5. La liste des publications s'affiche → on clique une publication
6. Les commentaires sont importés → on lance le tirage → un gagnant s'affiche
7. Refaire le même parcours en cliquant l'onglet « Instagram »
8. Montrer le bouton « Déconnecter »

> Astuce : Meta veut voir que CHAQUE permission demandée est réellement utilisée à l'écran.

---

## D. Compte de test pour le réviseur
Fournir un compte Facebook de test (ou cocher « l'app peut être testée sans identifiants » si le parcours est visible). Idéalement, ajouter le réviseur via un compte de test avec une Page contenant des commentaires.

---

## E. Rappel des limites
- Tant que la revue n'est pas validée : seuls toi + les testeurs ajoutés (Rôles → Testeurs) peuvent utiliser Facebook/Instagram.
- Le grand public ne pourra utiliser FB/IG qu'après l'approbation finale.
