# Déploiement de E-services Tirage sur un VPS

Guide pas à pas pour mettre l'app en ligne sur `tirage.e-services-kouba.com`.
On suppose un VPS sous **Ubuntu/Debian** avec accès **SSH**.

> ⚠️ À faire AVANT : régénérer le jeton Facebook (Business Settings → Utilisateurs
> système → Générer un token) et la clé API YouTube, puis mettre les nouvelles
> valeurs dans le `.env` du serveur. Ne jamais laisser le `.env` public.

---

## 1. DNS — créer le sous-domaine
Dans la gestion DNS de `e-services-kouba.com`, ajoute un enregistrement :
- Type : **A**
- Nom : **tirage**
- Valeur : **l'adresse IP de ton VPS**

## 2. Installer les outils sur le VPS
```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nginx
```

## 3. Envoyer le code
Place le dossier du projet dans `/var/www/tirage-concours` (via git, scp ou SFTP).
Arborescence attendue :
```
/var/www/tirage-concours/
├── index.html  style.css  app.js
└── backend/
    ├── app.py  requirements.txt  .env
```

## 4. Environnement Python
```bash
cd /var/www/tirage-concours
python3 -m venv venv
./venv/bin/pip install -r backend/requirements.txt
```

## 5. Configurer le .env (production)
Édite `/var/www/tirage-concours/backend/.env` :
- `SECRET_KEY` = une longue chaîne aléatoire
- `FB_REDIRECT_URI=https://tirage.e-services-kouba.com/auth/facebook/callback`
- les clés/jetons régénérés (YouTube, FB_SYSTEM_TOKEN…)

## 6. Test rapide avec gunicorn
```bash
cd /var/www/tirage-concours/backend
../venv/bin/gunicorn --bind 127.0.0.1:8000 app:app
```
Si pas d'erreur, fais Ctrl+C et passe à l'étape service.

## 7. Service systemd (démarrage auto + redémarrage)
```bash
sudo cp /var/www/tirage-concours/deploy/tirage.service /etc/systemd/system/
sudo chown -R www-data:www-data /var/www/tirage-concours
sudo systemctl daemon-reload
sudo systemctl enable --now tirage
sudo systemctl status tirage      # doit afficher "active (running)"
```

## 8. Nginx (reverse proxy)
```bash
sudo cp /var/www/tirage-concours/deploy/nginx-tirage.conf /etc/nginx/sites-available/tirage
sudo ln -s /etc/nginx/sites-available/tirage /etc/nginx/sites-enabled/
sudo nginx -t        # test config
sudo systemctl reload nginx
```
À ce stade : http://tirage.e-services-kouba.com doit afficher l'app.

## 9. HTTPS (gratuit, Let's Encrypt)
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tirage.e-services-kouba.com
```
Certbot configure le HTTPS et la redirection automatiquement.

## 10. Facebook : mettre à jour la redirection
Dans l'app Meta (Facebook Login for Business → Paramètres), l'URI
`https://tirage.e-services-kouba.com/auth/facebook/callback` est déjà autorisée
par défaut en mode dev. En mode jeton système, l'OAuth n'est de toute façon pas
utilisé, donc rien d'autre à faire.

## 11. Ajouter le bouton sur le site principal
Sur e-services-kouba.com, ajoute une section/bouton « Tirage au sort »
qui pointe vers **https://tirage.e-services-kouba.com**.

---

## Commandes utiles
```bash
sudo systemctl restart tirage     # redémarrer après une mise à jour du code
sudo journalctl -u tirage -n 50   # voir les logs de l'app
```
