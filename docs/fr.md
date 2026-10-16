# August / Yale — guide d'utilisation

Cette intégration amène vos **serrures connectées** et **sonnettes vidéo**
**August** et **Yale** dans Gladys Assistant, via le cloud August / Yale — celui
qu'utilisent les applications officielles.

## Ce que vous obtenez

| Appareil          | Dans Gladys                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Serrure connectée | Commande verrouiller / déverrouiller, batterie, porte ouverte / fermée (DoorSense), batterie du clavier |
| Sonnette vidéo    | Dernière image (caméra), sonnerie, mouvement, batterie                                                  |

En plus des appareils :

- **Déclencheurs de scène** : _Serrure manœuvrée_ (filtre sur la serrure,
  l'action — verrouillée, déverrouillée, ouverte — et la manière : application,
  à distance, clavier, à la main, verrouillage automatique, empreinte, badge ;
  le nom de l'utilisateur est disponible en variable), _Serrure bloquée_,
  _Sonnette pressée_, _Mouvement devant la sonnette_.
- **Actions de scène** : _Verrouiller une porte_, _Déverrouiller une porte_,
  _Ouvrir une porte (tirer le pêne)_, _Capturer une image de la sonnette_.
  Chacune indique si elle a réussi, pour conditionner les actions suivantes.
- **Widgets du tableau de bord** : _Serrure_ (une serrure et ses boutons, ou la
  vue d'ensemble de toutes les serrures avec un bouton « Tout verrouiller »),
  _Sonnette vidéo_ (dernière image, dernier coup de sonnette et dernier
  mouvement), _Activité des portes_ (qui a fait quoi, comment et quand).

Modèles pris en charge : toutes les serrures et sonnettes gérées par les
applications August, Yale Access et Yale Home — August Smart Lock (toutes
générations), August Wi-Fi Smart Lock, Yale Linus, Yale Linus L2, Yale Assure
Lock / Assure Lock 2, Yale Conexis L2, Yale Unity, August View, Yale Smart
Video Doorbell…

## Prérequis

- Gladys Assistant **5.1 ou plus récent**.
- Un compte dans l'application **August**, **Yale Access** ou **Yale Home**, avec
  vos appareils déjà installés.
- Pour suivre l'état en direct et piloter une serrure depuis Gladys, la serrure
  doit être joignable par le cloud : un **pont Wi-Fi** (August Connect, Yale
  Connect Wi-Fi Bridge) ou une serrure Wi-Fi intégrée. Sans pont, la serrure
  apparaît avec un point orange : son état n'est mis à jour que lorsqu'un
  téléphone équipé de l'application la croise en Bluetooth.

L'intégration fonctionne **uniquement via le cloud** : le conteneur de Gladys
n'a pas accès au Bluetooth, le pilotage local n'est donc pas disponible.

## Configuration

1. Ouvrez **Intégrations → August / Yale → Configuration**.
2. Choisissez l'**application** dans laquelle vos serrures sont enregistrées :
   - _August_ — l'application August ;
   - _Yale Access_ — l'application Yale Access (Amérique du Nord) ;
   - _Yale Home_ — l'application Yale Home (Europe et reste du monde).
3. Choisissez la **méthode de connexion** (e-mail ou numéro de téléphone),
   saisissez l'**identifiant** et le **mot de passe** de votre compte, puis
   enregistrez.
4. La première fois, le cloud envoie un **code de vérification** par e-mail ou
   SMS. Saisissez-le dans l'action **Valider le code** de l'écran de
   configuration. Pas reçu ? Utilisez **Envoyer un nouveau code**.
5. Ouvrez l'onglet **Découverte** : vos serrures et sonnettes y sont listées.
   Créez-les.

Le code n'est demandé qu'une fois : la session est conservée dans le stockage
de l'intégration. Changer de compte ou d'application redemande un code.

## Options

- **Événements en temps réel** (activé par défaut) : les événements (serrure
  manœuvrée, sonnette pressée…) arrivent en quelques secondes par le canal
  qu'utilisent les applications. Désactivé, l'activité est lue chaque minute.
- **Autoriser le déverrouillage depuis Gladys** (activé par défaut) :
  désactivez-le pour garantir que Gladys peut verrouiller mais jamais
  déverrouiller ni ouvrir une porte — les widgets n'affichent alors que le
  bouton « Verrouiller » et les actions de scène de déverrouillage sont
  refusées.
- **Intervalle de rafraîchissement** : fréquence de relecture de tous les
  appareils (5 minutes par défaut, 1 minute minimum).

## Valeurs

- Serrure : `1` = verrouillée, `0` = déverrouillée (une porte ouverte par le
  pêne vaut `0`).
- Porte : `1` = fermée, `0` = ouverte.
- Sonnerie et mouvement : `1` pendant quelques secondes, puis retour à `0`.

## Dépannage

- **« Connexion refusée »** : vérifiez l'application (August / Yale Access /
  Yale Home), la méthode de connexion et le mot de passe. Connectez-vous à
  l'application avec les mêmes identifiants pour en avoir le cœur net.
- **Aucun code reçu** : regardez dans les spams, puis utilisez **Envoyer un
  nouveau code**. Un numéro de téléphone doit être au format international
  (ex. `+33612345678`).
- **Une serrure apparaît injoignable** : son pont Wi-Fi est hors ligne.
  Vérifiez son alimentation et son Wi-Fi.
- **Comptes Yale Home** : Yale migre progressivement les comptes Yale Home vers
  un nouveau système de connexion. Si la connexion est refusée alors que les
  identifiants fonctionnent dans l'application, ouvrez une issue sur le dépôt.
- Utilisez **Tester la connexion** pour relire le compte et voir combien de
  serrures et de sonnettes ont été trouvées. Les logs de l'intégration
  (Gladys → Paramètres → Système → Intégrations) en disent plus ; ils ne
  contiennent jamais votre mot de passe ni votre jeton.

## Confidentialité et sécurité

Le mot de passe reste dans la configuration de Gladys ; le jeton de session est
stocké dans le volume privé de l'intégration. Seuls le cloud August / Yale, son
service temps réel (PubNub) et l'hébergeur des images des sonnettes
(Cloudinary) sont contactés. Signalez un problème de sécurité en privé, voir
`SECURITY.md` dans le dépôt.
