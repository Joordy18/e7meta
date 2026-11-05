# e7overlay

Statistiques de builds pour Epic Seven : pour chaque héros, les sets d'équipement et les artefacts les plus utilisés, plus la répartition des stats. Un collecteur TypeScript récupère les données et les écrit en JSON statique ; un site React (en français) les affiche.

## Commandes

- `npm run collect` : récupère les données (environ 1 200 appels séquentiels, plusieurs minutes). Ne fait rien (`skipped`) si la période est déjà collectée ; `-- --force` pour refaire.
- `npm run dev` : lance le site en local.
- `npm test` : lance les tests.
- `npm run overlay` : construit le site puis l'ouvre dans une fenêtre **toujours au premier plan** (par-dessus le jeu en fenêtré ou sans bordure ; pas en plein écran exclusif). `Ctrl+Alt+E` affiche/masque la fenêtre sans lui donner le focus.
- `npm run overlay:smoke` : vérifie que l'overlay démarre et charge les données (affiche `SMOKE OK`).

(`npm run build` construit le site statique.)

## Collecte quotidienne (Windows)

Les classements changent une fois par semaine ; une collecte quotidienne ne coûte que 2 appels tant que la semaine est inchangée.

```
powershell -File scripts/schedule-collect.ps1 -Time 12:00    # crée la tâche planifiée E7Meta-Collect
powershell -File scripts/schedule-collect.ps1 -Remove        # la supprime
```

Elle lance `scripts/collect-daily.cmd` (sortie dans `collect.log`, ignoré par git). Les nouveaux instantanés arrivent dans `public/data/` ; à toi de les commiter.

## Données

Les snapshots sont dans `public/data/<période>/` (`heroes.json` et `hero/<code>.json`), la liste des périodes dans `public/data/index.json`. Ils sont versionnés dans git.

Elles viennent de l'API publique officielle du jeu (`api.onstove.com`), qui n'est pas documentée : elle peut changer sans préavis. Vérifier ses conditions d'utilisation avant de publier le site.

Les deux sources n'ont pas la même période : les classements d'équipement/artefacts et les statistiques détaillées (combinaisons, répartition des stats) sont mises à jour séparément, chaque bloc affiche donc sa propre période.
