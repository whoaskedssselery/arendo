import cowork1 from "./assets/photos/cowork-1.webp";
import cowork2 from "./assets/photos/cowork-2.webp";
import loft1 from "./assets/photos/loft-1.webp";
import loft2 from "./assets/photos/loft-2.webp";
import meet1 from "./assets/photos/meet-1.webp";
import meet2 from "./assets/photos/meet-2.webp";
import store1 from "./assets/photos/store-1.webp";
import store2 from "./assets/photos/store-2.webp";
import studio1 from "./assets/photos/studio-1.webp";
import studio2 from "./assets/photos/studio-2.webp";

const groups: [RegExp, string[]][] = [
  [/склад/i, [store1, store2]],
  [/ковор/i, [cowork1, cowork2]],
  [/лофт/i, [loft2, loft1]],
  [/перегов|конферен|зал/i, [meet1, meet2]],
  [/студи|фото/i, [studio2, studio1]],
];

export const authImage = loft2;

/** Иллюстрация по смыслу названия, когда у помещения нет своего фото. */
export function photoFor(hint: string, seed = 0) {
  const set = groups.find(([pattern]) => pattern.test(hint))?.[1] ?? [
    loft1,
    meet1,
  ];
  return set[seed % set.length];
}
