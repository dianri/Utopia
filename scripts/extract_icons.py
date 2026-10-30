#!/usr/bin/env python3
"""
scripts/extract_icons.py
Segmenta, recorta, aplica transparencia y guarda los 50 iconos tácticos del atlas 'Glosario Utopia.png'.
"""

import os
import glob
from PIL import Image
import numpy as np
from scipy.ndimage import label, binary_dilation

# 1. Localizar la imagen de origen
candidates = glob.glob("*Glosario*Ut*pia*.png") + ["Glosario Utopia.png", "Glosario Utipia.png"]
source_path = next((f for f in candidates if os.path.exists(f)), None)

if not source_path:
    raise FileNotFoundError("No se encontró el archivo de atlas 'Glosario Utopia.png' en la raíz.")

print(f"Cargando atlas: {source_path}")
img = Image.open(source_path).convert("RGBA")
width, height = img.size
arr = np.array(img)
gray = arr[:, :, :3].mean(axis=2)

OUTPUT_BASE = os.path.join("public", "assets", "icons")

# Catálogo canónico de los 50 activos
ASSETS = [
    # LOTE 01 - IDENTIDAD Y MONSTRUOS (5)
    ("01", "app-logo.png", "app"),
    ("02", "app-hero.png", "app"),
    ("03", "monster-stalker.png", "monsters"),
    ("04", "monster-alpha.png", "monsters"),
    ("05", "monster-colossus.png", "monsters"),
    # LOTE 02 - ROLES Y ESTADOS (6)
    ("06", "role-scout.png", "roles"),
    ("07", "role-medic.png", "roles"),
    ("08", "role-tank.png", "roles"),
    ("09", "role-marksman.png", "roles"),
    ("10", "player-wounded.png", "roles"),
    ("11", "player-ghost.png", "roles"),
    # LOTE 03 - ARMAMENTO I (6)
    ("12", "weapon-fists.png", "weapons"),
    ("13", "weapon-knife.png", "weapons"),
    ("14", "weapon-axe.png", "weapons"),
    ("15", "weapon-pistol.png", "weapons"),
    ("16", "weapon-shotgun.png", "weapons"),
    ("17", "weapon-rifle.png", "weapons"),
    # LOTE 04 - ARMAS ESPECIALES Y MASCOTAS (6)
    ("18", "weapon-grenade.png", "weapons"),
    ("19", "weapon-rpg.png", "weapons"),
    ("20", "pet-dog.png", "pets"),
    ("21", "pet-drone.png", "pets"),
    ("22", "pet-electric-mouse.png", "pets"),
    ("23", "pet-rabbit.png", "pets"),
    # LOTE 05 - MASCOTAS Y COFRES (6)
    ("24", "pet-cat.png", "pets"),
    ("25", "pet-medbot.png", "pets"),
    ("26", "chest-active.png", "chests"),
    ("27", "chest-guarded.png", "chests"),
    ("28", "chest-looted.png", "chests"),
    ("29", "chest-key-chip.png", "chests"),
    # LOTE 06 - SUMINISTROS (6)
    ("30", "crate-dial.png", "crates"),
    ("31", "crate-medkit.png", "crates"),
    ("32", "crate-ammo.png", "crates"),
    ("33", "crate-weapons.png", "crates"),
    ("34", "crate-explosives.png", "crates"),
    ("35", "crate-airdrop.png", "crates"),
    # LOTE 07 - ESTRUCTURAS Y NAVEGACIÓN (5)
    ("36", "structure-hospital.png", "structures"),
    ("37", "structure-shelter.png", "structures"),
    ("38", "hospital-pod.png", "structures"),
    ("39", "hud-compass.png", "hud"),
    ("40", "hud-map-satellite.png", "hud"),
    # LOTE 08 - INTERFAZ TÁCTICA (5)
    ("41", "hud-map-tactical.png", "hud"),
    ("42", "hud-locate-center.png", "hud"),
    ("43", "hud-backpack.png", "hud"),
    ("44", "hud-audio-on.png", "hud"),
    ("45", "hud-audio-stealth.png", "hud"),
    # LOTE 09 - RECOMPENSAS Y COMUNICACIÓN (5)
    ("46", "hud-trophy.png", "hud"),
    ("47", "hud-leave-mission.png", "hud"),
    ("48", "ping-danger.png", "hud"),
    ("49", "ping-assist.png", "hud"),
    ("50", "ping-loot.png", "hud"),
]

# Definición espacial de cada uno de los 9 lotes
# (id_lote, idx_inicio, idx_fin, x_min, x_max, y_icon_min, y_icon_max, num_items)
LOTES_CONFIG = [
    ("L01", 1, 5, 0, 765, 36, 188, 5),
    ("L02", 6, 11, 770, 1536, 36, 188, 6),
    ("L03", 12, 17, 0, 765, 255, 382, 6),
    ("L04", 18, 23, 770, 1536, 255, 382, 6),
    ("L05", 24, 29, 0, 765, 452, 576, 6),
    ("L06", 30, 35, 770, 1536, 452, 576, 6),
    ("L07", 36, 40, 0, 765, 650, 776, 5),
    ("L08", 41, 45, 770, 1536, 650, 776, 5),
    ("L09", 46, 50, 0, 765, 846, 970, 5),
]

def find_valley(gray_slice, x_est, search_range=45):
    """Encuentra la columna más oscura alrededor de x_est para evitar sangrado de iconos vecinos."""
    x_min = max(0, x_est - search_range)
    x_max = min(gray_slice.shape[1], x_est + search_range)
    sums = gray_slice.sum(axis=0)[x_min:x_max]
    best_x = x_min + int(np.argmin(sums))
    return best_x

def make_background_transparent(cropped_img):
    """
    Convierte el fondo negro exterior en transparencia alfa limpia
    preservando el resplandor neón/glow y sin perforar blindajes oscuros interiores.
    """
    np_img = np.array(cropped_img).astype(np.float32)
    r, g, b, a = np_img[:, :, 0], np_img[:, :, 1], np_img[:, :, 2], np_img[:, :, 3]
    max_rgb = np.maximum(np.maximum(r, g), b)

    # 1. El fondo negro puro del atlas tiene brillo <= 5
    is_dark = max_rgb <= 5

    # 2. Inundación conectada desde los 4 bordes exteriores
    labeled, num_features = label(is_dark)
    border_labels = set()
    border_labels.update(labeled[0, :].tolist())
    border_labels.update(labeled[-1, :].tolist())
    border_labels.update(labeled[:, 0].tolist())
    border_labels.update(labeled[:, -1].tolist())
    border_labels.discard(0)

    bg_mask = np.isin(labeled, list(border_labels))

    # 3. Asignación de alfa: exterior = 0, interior = 255
    alpha = np.ones_like(max_rgb) * 255.0
    alpha[bg_mask] = 0.0

    # 4. Zona de transición suave en el borde exterior sin tocar sombras internas
    edge_zone = binary_dilation(bg_mask, iterations=2) & ~bg_mask & (max_rgb < 35)
    alpha[edge_zone] = np.clip((max_rgb[edge_zone] - 4) / 30.0 * 255.0, 0, 255)

    np_img[:, :, 3] = np.minimum(a, alpha)
    return Image.fromarray(np_img.astype(np.uint8))

def make_square_and_resize(pil_img, target_size=512, padding=24):
    """Centra el icono en un lienzo cuadrado con padding proporcional y remuestreo Lanczos."""
    w, h = pil_img.size
    max_dim = max(w, h)
    scale = (target_size - 2 * padding) / float(max_dim)
    new_w = max(1, int(w * scale))
    new_h = max(1, int(h * scale))
    resized = pil_img.resize((new_w, new_h), Image.Resampling.LANCZOS)

    square_img = Image.new("RGBA", (target_size, target_size), (0, 0, 0, 0))
    paste_x = (target_size - new_w) // 2
    paste_y = (target_size - new_h) // 2
    square_img.paste(resized, (paste_x, paste_y), resized)
    return square_img

def main():
    print(f"Iniciando extracción y segmentación de 50 activos...")
    extracted_count = 0

    asset_map = {item[0]: item for item in ASSETS}

    for lote_name, s_idx, e_idx, x0, x1, y0, y1, n in LOTES_CONFIG:
        # Calcular cortes verticales óptimos entre iconos
        cuts = [x0]
        w_total = x1 - x0
        for k in range(1, n):
            est = int(x0 + k * (w_total / n))
            cut = find_valley(gray[y0:y1, :], est)
            cuts.append(cut)
        cuts.append(x1)

        for i in range(n):
            idx = s_idx + i
            id_str = f"{idx:02d}"
            asset_info = asset_map.get(id_str)
            if not asset_info:
                print(f"Advertencia: no se encontró info para activo {id_str}")
                continue

            _, filename, subfolder = asset_info
            cx0 = cuts[i]
            cx1 = cuts[i + 1]

            # Encontrar bounding box ajustado al objeto gráfico dentro de la celda
            sub_gray = gray[y0:y1, cx0:cx1]
            active_y, active_x = np.where(sub_gray > 16)
            if len(active_y) > 0:
                pad = 3
                min_y = max(y0, y0 + active_y.min() - pad)
                max_y = min(y1, y0 + active_y.max() + pad)
                min_x = max(cx0, cx0 + active_x.min() - pad)
                max_x = min(cx1, cx0 + active_x.max() + pad)
            else:
                min_x, max_x, min_y, max_y = cx0, cx1, y0, y1

            cropped = img.crop((min_x, min_y, max_x, max_y))
            trans = make_background_transparent(cropped)
            final_icon = make_square_and_resize(trans, target_size=512, padding=24)

            dest_dir = os.path.join(OUTPUT_BASE, subfolder)
            os.makedirs(dest_dir, exist_ok=True)
            dest_file = os.path.join(dest_dir, filename)

            final_icon.save(dest_file, format="PNG")
            extracted_count += 1
            print(f"  [{id_str}/50] Guardado: {dest_file} (box: {min_x},{min_y},{max_x},{max_y})")

    print(f"\nProceso finalizado con éxito: {extracted_count}/50 iconos extraídos y guardados en '{OUTPUT_BASE}'.")

if __name__ == "__main__":
    main()
