# Privacy

profs holds grades and names of students, some of them minors. It is built so
that this data never leaves the device it was entered on.

## What the app does

- Every piece of data — classes, students, grades, notes — is stored in your
  browser's IndexedDB, on your device.
- The app makes **no network requests**. No API, no analytics, no telemetry, no
  crash reporting, no fonts or scripts loaded from a CDN. After the first load
  it works with the network switched off, and nothing changes when it comes
  back.
- There is no account, no login, no identifier of any kind.

## Moving data between devices

Réglages → Sauvegarde exports a JSON file. You move that file yourself, by
whatever means you trust, and import it on the other device. Nobody else handles
it. Student photos are not included in the export — a JSON file cannot carry a
photo — and importing on another device is the only way to move data; there is
no sync of any kind. A backup exported before the classroom features (sessions,
attendance, seating) were added is rejected on import by design — that older
data is treated as disposable rather than migrated, so export a fresh backup
with the current version before moving data between devices.

## Photos, remarques et comportement

- **Photos.** La photo d'un élève est stockée telle quelle sur l'appareil (un
  `Blob` dans IndexedDB), jamais transmise, et supprimable élève par élève.
  Elle n'est **jamais incluse dans l'export JSON** : un fichier JSON ne peut
  pas transporter un `Blob`.
- **Remarques (`Student.notes`).** Ce champ peut porter des informations
  sensibles — PAP, PPRE, tiers-temps, contraintes de placement. Contrairement
  aux photos, **les remarques sont incluses dans l'export JSON** : l'export
  est le fichier de l'enseignant, et ce point est précisé ici pour ne pas être
  découvert après coup.
- **Comportement.** Chaque observation (encouragement, avertissement, mot
  dans le carnet, note libre) est horodatée et rattachée à une séance. C'est
  une donnée sur un mineur, conservée jusqu'à sa suppression explicite.
- **Annotations de cellule (`Grade.note`).** Chaque note de la grille est un
  champ de texte libre : l'enseignant peut y écrire n'importe quoi, y compris
  des informations sensibles sur un élève. Comme les remarques (`Student.notes`),
  **les annotations sont incluses dans l'export JSON** — c'est l'export de
  l'enseignant, et ce point est précisé ici pour la même raison.

- **Le journal** (`journal de bord`) est du texte libre, saisi par l'enseignant,
  qui peut mentionner des élèves nommément. Comme `Student.notes` et les
  annotations de cellule, **il est inclus dans l'export JSON** — c'est l'export
  de l'enseignant. Il ne quitte jamais l'appareil autrement, n'est consultable
  par personne d'autre, et **ne remplace pas le cahier de textes officiel** de
  l'ENT : ce dernier doit rester rempli dans Pronote ou l'espace numérique de
  l'établissement.

## Deleting data

Réglages → Zone dangereuse → "Supprimer toutes les données" erases the whole
workspace from the device. Clearing the site data in your browser has the same
effect. Neither is recoverable — export first if you want a copy.

## GDPR / RGPD

Because no data is transmitted or stored anywhere but the teacher's own device,
the app introduces no processor and no transfer. The teacher remains responsible
for the device itself: lock it, and export backups only to storage they control.
