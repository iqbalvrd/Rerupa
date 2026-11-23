import * as THREE from "three";
import { canvasTexture, seededRandom, solid } from "./scene-utils";

function tilePattern() {
  const clay = ["#9b563e", "#a05b41", "#a35e43", "#96523d", "#a46146", "#9c573f", "#90513c"];
  return canvasTexture(256, 256, (g, w, h) => {
    const rng = seededRandom(712);
    g.fillStyle = "#734b3c";
    g.fillRect(0, 0, w, h);
    const columns = 8;
    const rows = 8;
    const dx = w / columns;
    const dy = h / rows;
    for (let row = 0; row < rows; row++) {
      const y = row * dy;
      for (let col = 0; col < columns; col++) {
        const offset = row % 2 ? dx / 2 : 0;
        const color = clay[Math.floor(rng() * clay.length)];
        for (const x of [col * dx + offset, col * dx + offset - w]) {
          if (x + dx < 0) continue;
          g.fillStyle = color;
          g.fillRect(x + 1, y + 1, dx - 1, dy - 1);
          const curve = g.createLinearGradient(x, y, x + dx, y);
          curve.addColorStop(0, "#492e2b51");
          curve.addColorStop(0.32, "#df91613f");
          curve.addColorStop(0.55, "#d39a6d24");
          curve.addColorStop(1, "#311f1a55");
          g.fillStyle = curve;
          g.fillRect(x + 1, y + 1, dx - 1, dy - 1);
          g.strokeStyle = "#70412d72";
          g.lineWidth = 1.35;
          g.beginPath();
          g.moveTo(x + 1, y + dy - 1.3);
          g.quadraticCurveTo(x + dx * 0.54, y + dy - 5, x + dx, y + dy - 1.3);
          g.stroke();
          g.strokeStyle = "#ebb18a46";
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(x + 4, y + 4);
          g.lineTo(x + 4, y + dy - 5);
          g.stroke();
        }
      }
    }
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = rng() < 0.5 ? "#34201427" : "#fedcb12a";
      g.fillRect(rng() * w, rng() * h, 0.5 + rng() * 1.6, 0.5 + rng() * 1.5);
    }
  });
}

function mineralGrain() {
  return canvasTexture(128, 128, (g, w, h) => {
    const rng = seededRandom(571);
    const pixels = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = x * Math.PI * 2 / w;
        const b = y * Math.PI * 2 / h;
        const fine = rng();
        const stain = Math.sin(a + b * 2) * Math.cos(a * 3 - b);
        const value = Math.round(233 + stain * 6 + fine * 9 - (fine < 0.06 ? 15 : 0));
        const i = (y * w + x) * 4;
        pixels.data.set([value, value, value, 255], i);
      }
    }
    g.putImageData(pixels, 0, 0);
  });
}

function woodGrain() {
  return canvasTexture(128, 128, (g, w, h) => {
    const rng = seededRandom(198);
    g.fillStyle = "#ded3bc";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 76; i++) {
      const x = rng() * w;
      const bend = rng() * 5 - 2.5;
      g.strokeStyle = rng() > 0.6 ? "#faf3da77" : "#60492d66";
      g.lineWidth = 0.42 + rng() * 1.1;
      for (const offset of [-w, 0, w]) {
        g.beginPath();
        g.moveTo(x + offset, 0);
        g.bezierCurveTo(x + offset + bend, h * 0.34, x + offset - bend, h * 0.66, x + offset, h);
        g.stroke();
      }
    }
  });
}

/** Tiny, shared procedural maps keep the facade off the asset download path. */
export function museumMaterials() {
  const tiles = tilePattern();
  const grain = mineralGrain();
  const timber = woodGrain();
  const textures = [tiles, grain, timber];
  for (const texture of textures) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
  }
  const stone = (color: string, roughness = 0.91) =>
    new THREE.MeshStandardMaterial({ color, map: grain, roughness });
  const wood = (color: string) =>
    new THREE.MeshStandardMaterial({ color, map: timber, roughness: 0.84 });

  return {
    textures,
    plaster: stone("#e4d7bd"),
    recessed: stone("#c4b294"),
    cream: stone("#ede0c4"),
    stone: stone("#afa798"),
    stoneShade: stone("#90897a"),
    roof: new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.94 }),
    clay: solid("#975840", 0.89),
    teak: wood("#75543e"),
    teakDark: wood("#4d3b2f"),
    olive: wood("#596653"),
    paintedWood: wood("#b7ad8f"),
    agedGold: solid("#9d794f", 0.76, 0.13),
    window: solid("#2c3938", 0.4, 0.06),
  };
}
