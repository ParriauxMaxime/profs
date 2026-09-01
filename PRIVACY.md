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
no sync of any kind.

## Deleting data

Réglages → Zone dangereuse → "Supprimer toutes les données" erases the whole
workspace from the device. Clearing the site data in your browser has the same
effect. Neither is recoverable — export first if you want a copy.

## GDPR / RGPD

Because no data is transmitted or stored anywhere but the teacher's own device,
the app introduces no processor and no transfer. The teacher remains responsible
for the device itself: lock it, and export backups only to storage they control.
