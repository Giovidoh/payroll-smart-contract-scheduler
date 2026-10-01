# TODO — ordonnanceur de paie

## In Progress
- [~] Mise en marche et démonstration de bout en bout — contrat de démo `0x68B5…8340`
  - [x] `verify:abi` : six signatures concordent avec `out/Payroll.sol/Payroll.json`
  - [x] `probe` (01/10/2026) : la simulation de `runPayroll` PASSE sur le contrat de démo
  - [x] `.env` renseigné ; compte ordonnanceur `0xA678…0cd0` (clé neuve, non propriétaire), 0,02 ETH
  - [x] Tick 1 (01/10, 02:37 UTC) → `EXECUTED`, tx `0x6c3041…56d4`, bloc 11818903, 73 842 gas, 2 salariés
  - [x] Tick 2 (02:38 UTC) → `EXECUTED`, tx `0xaa89d4…4dc6`, bloc 11818906 : intervalle de 10 s écoulé, attendu
  - [x] `NOT_DUE` sur le contrat de 30 jours (`0xA15f…206A`), 02:52 UTC : aucune transaction, sortie 0
  - [x] B8 de l'application web : les deux cycles affichés (2 × 4 200 mUSDC), vu par l'utilisateur
  - [ ] `npm run tick` ne charge pas `.env` en local (README trompeur) : ajouter `tick:local`
  - [ ] C2 (côté salarié) à voir
  - [ ] Secrets et variables GitHub, puis « Run workflow » depuis l'onglet Actions

## To Do
- [ ] Alerte `UNDERFUNDED` par Resend : domaine expéditeur vérifié requis

## Done

## Blocked
