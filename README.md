# e7overlay

Statistiques de builds pour Epic Seven : pour chaque héros, les sets d'équipement et les artefacts les plus utilisés, plus la répartition des stats. Un collecteur TypeScript récupère les données et les écrit en JSON statique ; un site React (en français) les affiche.

## Commandes

- `npm run collect` : récupère les données (environ 1 200 appels séquentiels, plusieurs minutes). Ne fait rien (`skipped`) si la période est déjà collectée ; `-- --force` pour refaire.
- `npm run dev` : lance le site en local.
- `npm test` : lance les tests.

(`npm run build` construit le site statique.)

## Données

Les snapshots sont dans `public/data/<période>/` (`heroes.json` et `hero/<code>.json`), la liste des périodes dans `public/data/index.json`. Ils sont versionnés dans git.

Elles viennent de l'API publique officielle du jeu (`api.onstove.com`), qui n'est pas documentée : elle peut changer sans préavis. Vérifier ses conditions d'utilisation avant de publier le site.

Les deux sources n'ont pas la même période : les classements d'équipement/artefacts et les statistiques détaillées (combinaisons, répartition des stats) sont mises à jour séparément, chaque bloc affiche donc sa propre période.
