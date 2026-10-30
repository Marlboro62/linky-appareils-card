<p>
  ☕ <strong>Si cette carte vous est utile, vous pouvez soutenir le projet :</strong>
</p>

<div style="white-space: nowrap; line-height: 0;">
  <a
    href="https://www.buymeacoffee.com/Marlboro62"
    target="_blank"
    rel="noopener noreferrer"
    style="display: inline-block; text-decoration: none; vertical-align: middle;"
  ><img
    src="https://img.buymeacoffee.com/button-api/?text=Offrir%20un%20caf%C3%A9&emoji=%E2%98%95&slug=Marlboro62&button_colour=FF5F5F&font_colour=ffffff&font_family=Cookie&outline_colour=000000&coffee_colour=FFDD00"
    alt="Offrir un café sur Buy Me a Coffee"
    height="45"
    style="display: block; border: 0;"
  ></a>&nbsp;&nbsp;<a
    href="https://ko-fi.com/M4M2QL45X"
    target="_blank"
    rel="noopener noreferrer"
    style="display: inline-block; text-decoration: none; vertical-align: middle;"
  ><img
    src="https://storage.ko-fi.com/cdn/kofi6.png?v=6"
    alt="Soutenir le projet sur Ko-fi"
    height="45"
    style="display: block; border: 0;"
  ></a>
</div>

# Carte Linky Appareils

Carte Lovelace pour Home Assistant qui affiche **ce que coûte chaque circuit et chaque appareil** : aujourd'hui, ce mois et sur le cycle de facturation, avec le poste Tempo en cours, le prix du kWh et la puissance instantanée.

Elle a le même style que la [Carte Enedis Linky New](https://github.com/Marlboro62/content-card-linky-new), mais elle est **indépendante** : elle s'installe à part, avec son propre type `custom:linky-appareils-card`, et ne remplace pas la carte Linky. Les deux peuvent être affichées sur le même tableau de bord.

🎮 **[Essayer la démo en ligne](https://marlboro62.github.io/linky-appareils-card/docs/demo.html)** : la vraie carte avec des données simulées, sans installer Home Assistant.

| Style MyElectricalData (sombre) | Clair | Appareils rangés dans leur circuit |
| --- | --- | --- |
| <img src="https://raw.githubusercontent.com/Marlboro62/linky-appareils-card/main/images/apercu-sombre.png" alt="Aperçu sombre" width="300"> | <img src="https://raw.githubusercontent.com/Marlboro62/linky-appareils-card/main/images/apercu-clair.png" alt="Aperçu clair" width="300"> | <img src="https://raw.githubusercontent.com/Marlboro62/linky-appareils-card/main/images/imbriques.png" alt="Imbriqués" width="300"> |

## Ce que la carte affiche

- **En-tête** : poste Tempo en cours (ex. « HP Bleu »), prix du kWh et puissance du logement.
- **Trois tuiles** : aujourd'hui, ce mois et cycle en cours, abonnement compris, avec la part énergie. Un clic sur une tuile change de période.
- **Énergie du mois par poste Tempo** : Bleu, Blanc et Rouge, en heures creuses et pleines.
- **Onglets Jour / Mois / Cycle** avec deux classements :
  - **Circuits** : les départs du tableau électrique, avec la part que les circuits ne mesurent pas ;
  - **Appareils** : prises connectées et appareils suivis.
- Chaque ligne donne la puissance actuelle (en vert quand l'appareil consomme), le coût de la période et une barre comparative. Un clic ouvre le capteur.
- **Imbrication** : un circuit peut contenir ses appareils, et un appareil d'autres appareils (une multiprise, par exemple), sur autant de niveaux que voulu. Un chevron plie ou déplie chaque groupe ; la carte retient votre choix sur cet appareil. Sous un groupe déplié, les barres sont à l'échelle du groupe et une ligne « Autres (non mesuré) » donne ce que ses enfants ne mesurent pas.
- Les appareils à 0 € sont regroupés sur une seule ligne (option `show_zero` pour les afficher).

> Les appareils sont en général déjà comptés dans leur circuit : il ne faut pas additionner les deux listes.

## Installation

### Avec HACS (recommandé)

1. Dans HACS, menu **⋮** → **Dépôts personnalisés**.
2. Ajoutez `https://github.com/Marlboro62/linky-appareils-card` avec le type **Tableau de bord** (Dashboard).
3. Cherchez **Carte Linky Appareils**, installez-la, puis rechargez la page (Ctrl+F5).

### Manuellement

1. Téléchargez [`linky-appareils-card.js`](https://raw.githubusercontent.com/Marlboro62/linky-appareils-card/main/linky-appareils-card.js) (clic droit → Enregistrer sous) et copiez-le dans `/config/www/`.
2. **Paramètres → Tableaux de bord → ⋮ → Ressources → Ajouter une ressource** :
   - URL : `/local/linky-appareils-card.js`
   - Type : **Module JavaScript**
3. Rechargez la page (Ctrl+F5).

## Capteurs nécessaires

La carte ne calcule rien elle-même : elle affiche des capteurs de coût que vous créez dans Home Assistant (par exemple avec des `utility_meter` et des capteurs template multipliant l'énergie par le prix du kWh).

### Circuits et appareils

**Sans configuration**, la carte trouve toute seule les capteurs nommés :

```
sensor.cout_<nom>_jour
sensor.cout_<nom>_mois
sensor.cout_<nom>_cycle
```

- Ceux qui commencent par `sensor.cout_disjoncteur_` vont dans **Circuits**, les autres dans **Appareils**.
- Si un capteur `sensor.<nom>_power` existe, sa valeur est affichée comme puissance actuelle.
- Le nom affiché vient du nom convivial du capteur, sans « Coût », « Disjoncteur » ni la période.

**Avec configuration**, vous listez vous-même les entités (voir l'exemple plus bas). Dès que `circuits:` ou `devices:` est présent, la détection automatique est désactivée.

### En-tête, tuiles et répartition Tempo

| Option | Rôle | Valeur par défaut |
| --- | --- | --- |
| `tarif` | Poste Tempo en cours, texte du type « HP BLEU » | `sensor.lixee_current_price` |
| `price` | Prix du kWh en cours | `sensor.tempo_tarif_ttc_actuel` |
| `power` | Puissance instantanée du logement | `sensor.lixee_sinsts` |
| `cost_day` | Coût total aujourd'hui (abonnement compris) | `sensor.tempo_cout_total_aujourd_hui` |
| `cost_month` | Coût total du mois | `sensor.tempo_cout_total_ce_mois` |
| `cost_cycle` | Coût total du cycle de facturation | `sensor.tempo_cout_total_cycle_en_cours` |
| `energy_day` | Coût énergie seule aujourd'hui | `sensor.tempo_cout_energie_aujourd_hui` |
| `energy_month` | Coût énergie seule du mois | `sensor.tempo_cout_energie_ce_mois` |
| `energy_cycle` | Coût énergie seule du cycle | `sensor.tempo_cout_energie_cycle_en_cours` |
| `kwh_prefix` | Préfixe des capteurs `<couleur>_<hc\|hp>_energie_ce_mois` (kWh) | `sensor.tempo_` |

Une option dont le capteur n'existe pas est simplement masquée.

## Options d'affichage

| Option | Rôle | Défaut |
| --- | --- | --- |
| `title` | Titre de la carte | `Coûts par appareil` |
| `period` | Onglet ouvert au chargement : `jour`, `mois` ou `cycle` | `mois` |
| `show_split` | Afficher l'énergie du mois par poste Tempo | `true` |
| `show_zero` | Afficher les appareils à 0 € au lieu de les regrouper | `false` |
| `expanded` | Groupes (éléments qui contiennent d'autres éléments) dépliés à l'ouverture | `false` |
| `theme` | `v2` (bleu nuit MyElectricalData), `auto` (clair ou sombre selon HA), `ha` (thème Home Assistant) | `v2` |

Toutes les options sont aussi disponibles dans l'**éditeur visuel**.

## Exemples

Configuration minimale, avec la détection automatique :

```yaml
type: custom:linky-appareils-card
```

Configuration complète avec listes explicites : voir [`exemples/carte-appareils.yaml`](https://github.com/Marlboro62/linky-appareils-card/blob/main/exemples/carte-appareils.yaml).

Chaque élément de `circuits:` ou `devices:` accepte :

| Clé | Rôle |
| --- | --- |
| `name` | Nom affiché |
| `icon` | Icône (ex. `mdi:water-boiler`), `mdi:flash` par défaut |
| `jour` (ou `day`) | Capteur de coût du jour |
| `mois` (ou `month`) | Capteur de coût du mois |
| `cycle` | Capteur de coût du cycle |
| `power` | Capteur de puissance en W (facultatif) |
| `devices` (ou `children`) | Liste d'éléments rangés dans celui-ci, avec les mêmes clés (facultatif) |
| `expanded` | Déplier ce groupe à l'ouverture, quelle que soit l'option de la carte (facultatif) |

### Circuits et appareils imbriqués

Placez les appareils sous leur circuit avec `devices:`. Un groupe peut aussi n'avoir aucun capteur : son coût est alors la somme de ses enfants (pratique pour une multiprise ou une pièce).

```yaml
circuits:
  - name: Prises salon
    icon: mdi:power-socket-fr
    mois: sensor.cout_disjoncteur_prises_salon_mois
    expanded: true
    devices:
      - name: Télévision
        icon: mdi:television
        mois: sensor.cout_television_mois
      - name: Multiprise bureau
        icon: mdi:power-socket-eu
        devices:
          - name: Ordinateur
            mois: sensor.cout_ordinateur_mois
          - name: Box internet
            mois: sensor.cout_box_internet_mois
```

L'état plié ou déplié de chaque groupe est retenu par le navigateur ; `expanded` ne sert qu'à la première ouverture.

## Support

Questions et problèmes : uniquement via les [issues GitHub](https://github.com/Marlboro62/linky-appareils-card/issues).

## Voir aussi

- [Carte Enedis Linky New](https://github.com/Marlboro62/content-card-linky-new) : consommation et production Linky via MyElectricalData.
- [Add-on MyElectricalData new](https://github.com/Marlboro62/hassio-addons) pour Home Assistant.

## Licence

MIT
