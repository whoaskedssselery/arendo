import {
  ArmchairIcon,
  BarbellIcon,
  BriefcaseIcon,
  BuildingsIcon,
  CameraIcon,
  CarIcon,
  CoffeeIcon,
  ConfettiIcon,
  DesktopTowerIcon,
  FilmSlateIcon,
  FlowerLotusIcon,
  ForkKnifeIcon,
  GameControllerIcon,
  GraduationCapIcon,
  type Icon,
  MicrophoneStageIcon,
  MusicNotesIcon,
  PackageIcon,
  PaintBrushIcon,
  PresentationChartIcon,
  StorefrontIcon,
  TreeIcon,
  UsersThreeIcon,
  WarehouseIcon,
  WrenchIcon,
} from "@phosphor-icons/react";

/** Встроенный набор: ключ хранится в photoUrl категории как /icons/<ключ>. */
export const categoryIcons: Record<string, [Icon, string]> = {
  presentation: [PresentationChartIcon, "Презентация"],
  desktop: [DesktopTowerIcon, "Компьютер"],
  camera: [CameraIcon, "Камера"],
  package: [PackageIcon, "Коробка"],
  buildings: [BuildingsIcon, "Здания"],
  warehouse: [WarehouseIcon, "Ангар"],
  briefcase: [BriefcaseIcon, "Портфель"],
  users: [UsersThreeIcon, "Люди"],
  graduation: [GraduationCapIcon, "Обучение"],
  coffee: [CoffeeIcon, "Кофе"],
  fork: [ForkKnifeIcon, "Еда"],
  confetti: [ConfettiIcon, "Праздник"],
  music: [MusicNotesIcon, "Музыка"],
  microphone: [MicrophoneStageIcon, "Микрофон"],
  film: [FilmSlateIcon, "Видео"],
  paint: [PaintBrushIcon, "Творчество"],
  barbell: [BarbellIcon, "Спорт"],
  lotus: [FlowerLotusIcon, "Йога"],
  game: [GameControllerIcon, "Игры"],
  couch: [ArmchairIcon, "Отдых"],
  store: [StorefrontIcon, "Магазин"],
  car: [CarIcon, "Гараж"],
  wrench: [WrenchIcon, "Мастерская"],
  tree: [TreeIcon, "На природе"],
};

const byName: [RegExp, string][] = [
  [/склад/i, "package"],
  [/ковор/i, "desktop"],
  [/перегов|конферен|зал/i, "presentation"],
  [/студи|фото/i, "camera"],
];

export const iconPath = (key: string) => `/icons/${key}`;
export const isUploadedIcon = (url?: string) =>
  url?.startsWith("/api/v1/uploads/") ?? false;

/** Ключ встроенной иконки: выбранный вручную или подобранный по названию. */
export function iconKey(name: string, photoUrl?: string) {
  const chosen = photoUrl?.startsWith("/icons/") ? photoUrl.slice(7) : "";
  if (Object.hasOwn(categoryIcons, chosen)) return chosen;
  return byName.find(([pattern]) => pattern.test(name))?.[1] ?? "buildings";
}

export function CategoryIcon({
  name,
  photoUrl,
  size = 26,
  active = false,
}: {
  name: string;
  photoUrl?: string;
  size?: number;
  active?: boolean;
}) {
  if (isUploadedIcon(photoUrl))
    return (
      <img
        className="category-image"
        src={photoUrl}
        alt=""
        width={size}
        height={size}
      />
    );
  const [Shape] = categoryIcons[iconKey(name, photoUrl)];
  return <Shape size={size} weight={active ? "fill" : "regular"} aria-hidden />;
}
