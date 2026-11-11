/**
 * Type definitions for the Penpot `.penpot` export format (v3).
 *
 * Ground truth:
 * - https://github.com/penpot/penpot/blob/develop/docs/technical-guide/developer/data-model/penpot-file-format.md
 * - https://github.com/penpot/penpot/blob/develop/library/src/lib/export.cljs
 * - https://github.com/penpot/penpot-exporter-figma-plugin (ui-src/lib/types)
 *
 * JSON keys are camelCase; keyword/enum values may appear kebab-case or
 * camelCase depending on the encoder, so readers should normalize.
 */

export type Uuid = string;

export type PenpotShapeType =
  | 'frame'
  | 'group'
  | 'rect'
  | 'circle'
  | 'path'
  | 'text'
  | 'image'
  | 'bool'
  | 'svg-raw'
  | 'component'
  | 'instance';

export interface PenpotManifest {
  type: 'penpot/export-files';
  version: number;
  generatedBy?: string;
  refer?: string;
  files: Array<{ id: Uuid; name: string; features?: string[] }>;
  relations?: Array<[Uuid, Uuid]>;
}

export interface PenpotFileMeta {
  id: Uuid;
  name: string;
  revn?: number;
  vern?: number;
  createdAt?: string;
  modifiedAt?: string;
  teamId?: Uuid;
  projectId?: Uuid;
  isShared?: boolean;
  hasMediaTrimmed?: boolean;
  features?: string[];
  migrations?: string[];
  options?: Record<string, unknown>;
}

export interface PenpotPageMeta {
  id: Uuid;
  name: string;
  index?: number;
  background?: string;
  options?: Record<string, unknown>;
}

export interface PenpotGradient {
  type: 'linear' | 'radial';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  width: number;
  stops: Array<{ color: string; opacity?: number; offset: number }>;
}

export interface PenpotImageRef {
  id: Uuid;
  width?: number;
  height?: number;
  mtype?: string;
  name?: string;
  keepAspectRatio?: boolean;
}

export interface PenpotFill {
  fillColor?: string;
  fillOpacity?: number;
  fillColorGradient?: PenpotGradient;
  fillImage?: PenpotImageRef;
  fillColorRefFile?: Uuid;
  fillColorRefId?: Uuid;
}

export type PenpotStrokeStyle = 'solid' | 'dotted' | 'dashed' | 'mixed' | 'none' | 'svg';
export type PenpotStrokeAlignment = 'center' | 'inner' | 'outer';
export type PenpotStrokeCap =
  | 'round'
  | 'square'
  | 'line-arrow'
  | 'triangle-arrow'
  | 'square-marker'
  | 'circle-marker'
  | 'diamond-marker';

export interface PenpotStroke {
  strokeColor?: string;
  strokeOpacity?: number;
  strokeColorGradient?: PenpotGradient;
  strokeImage?: PenpotImageRef;
  strokeColorRefFile?: Uuid;
  strokeColorRefId?: Uuid;
  strokeStyle?: PenpotStrokeStyle;
  strokeWidth?: number;
  strokeAlignment?: PenpotStrokeAlignment;
  strokeCapStart?: PenpotStrokeCap;
  strokeCapEnd?: PenpotStrokeCap;
  strokeDash?: number;
  strokeGap?: number;
  strokePerSide?: boolean;
  strokeWidthTop?: number;
  strokeWidthRight?: number;
  strokeWidthBottom?: number;
  strokeWidthLeft?: number;
}

export interface PenpotColor {
  color?: string;
  opacity?: number;
  gradient?: PenpotGradient;
  image?: PenpotImageRef;
  refId?: Uuid;
  refFile?: Uuid;
}

export interface PenpotShadow {
  id?: Uuid | null;
  style?: 'drop-shadow' | 'inner-shadow';
  offsetX?: number;
  offsetY?: number;
  blur?: number;
  spread?: number;
  hidden?: boolean;
  color?: PenpotColor | string;
}

export interface PenpotBlur {
  id?: Uuid;
  type?: 'layer-blur' | 'background-blur';
  value?: number;
  hidden?: boolean;
}

export interface PenpotPoint {
  x: number;
  y: number;
}

export interface PenpotMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export type PenpotPathCommand = 'moveTo' | 'move-to' | 'lineTo' | 'line-to' | 'curveTo' | 'curve-to' | 'closePath' | 'close-path';

export interface PenpotPathSegment {
  command: PenpotPathCommand;
  params?: {
    x?: number;
    y?: number;
    c1x?: number;
    c1y?: number;
    c2x?: number;
    c2y?: number;
  };
}

export interface PenpotTextSpan {
  text: string;
  fontFamily?: string;
  fontSize?: string | number;
  fontWeight?: string | number;
  fontStyle?: 'normal' | 'italic';
  lineHeight?: string | number;
  letterSpacing?: string | number;
  textAlign?: 'left' | 'right' | 'center' | 'justify';
  textDecoration?: string;
  textTransform?: string;
  direction?: string;
  textDirection?: 'ltr' | 'rtl' | 'auto';
  fills?: PenpotFill[];
  typographyRefId?: Uuid;
  typographyRefFile?: Uuid;
}

export interface PenpotTextParagraph extends PenpotTextSpan {
  type?: 'paragraph';
  children?: PenpotTextSpan[];
}

export interface PenpotTextContent {
  type?: 'root';
  verticalAlign?: 'top' | 'bottom' | 'center';
  children?: Array<{
    type?: 'paragraph-set' | 'paragraph-set';
    children?: PenpotTextParagraph[];
  }>;
}

export interface PenpotGrid {
  type?: 'column' | 'row' | 'square';
  display?: boolean;
  params?: Record<string, unknown>;
}

export interface PenpotExportSetting {
  type?: string;
  scale?: number;
  suffix?: string;
}

export type PenpotEventType =
  | 'click'
  | 'mouse-press'
  | 'mouse-over'
  | 'mouse-enter'
  | 'mouse-leave'
  | 'after-delay';

export interface PenpotAnimation {
  animationType?: 'dissolve' | 'slide' | 'push';
  duration?: number;
  easing?: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out';
  way?: 'in' | 'out';
  direction?: 'right' | 'left' | 'up' | 'down';
  offsetEffect?: boolean;
}

export interface PenpotInteraction {
  actionType?:
    | 'navigate'
    | 'open-overlay'
    | 'toggle-overlay'
    | 'close-overlay'
    | 'prev-screen'
    | 'open-url';
  eventType?: PenpotEventType;
  destination?: Uuid;
  preserveScroll?: boolean;
  animation?: PenpotAnimation;
  url?: string;
  overlayPosition?: PenpotPoint;
  overlayPosType?: string;
  closeClickOutside?: boolean;
  backgroundOverlay?: boolean;
  positionRelativeTo?: Uuid;
}

export interface PenpotLayoutGap {
  rowGap?: number;
  columnGap?: number;
}

export interface PenpotLayoutPadding {
  p1?: number;
  p2?: number;
  p3?: number;
  p4?: number;
}

export interface PenpotShape {
  id: Uuid;
  name: string;
  type: PenpotShapeType;
  pageId?: Uuid;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  selrect?: { x: number; y: number; width: number; height: number };
  points?: PenpotPoint[];
  transform?: PenpotMatrix | number[];
  transformInverse?: PenpotMatrix | number[];
  rotation?: number;
  parentId?: Uuid;
  frameId?: Uuid;
  shapes?: Uuid[];
  hidden?: boolean;
  blocked?: boolean;
  locked?: boolean;
  collapsed?: boolean;
  opacity?: number;
  blendMode?: string;
  proportion?: number;
  proportionLock?: boolean;
  fills?: PenpotFill[];
  strokes?: PenpotStroke[];
  shadow?: PenpotShadow[];
  blur?: PenpotBlur;
  constraintsH?: string;
  constraintsV?: string;
  r1?: number;
  r2?: number;
  r3?: number;
  r4?: number;
  componentId?: Uuid;
  componentFile?: Uuid;
  shapeRef?: Uuid;
  mainInstance?: boolean;
  componentRoot?: boolean;
  touched?: unknown[];
  interactions?: PenpotInteraction[];
  exports?: PenpotExportSetting[];
  grids?: PenpotGrid[];
  appliedTokens?: Record<string, string>;
  pluginData?: Record<string, unknown>;

  // type-specific
  content?: PenpotPathSegment[] | PenpotTextContent | string | Record<string, unknown>;
  boolType?: 'union' | 'difference' | 'exclude' | 'intersection';
  svgAttrs?: { fillRule?: 'evenodd' | 'nonzero' };
  metadata?: { width?: number; height?: number; mtype?: string; id?: Uuid };
  characters?: string;
  fontSize?: string | number;
  lineHeight?: string | number;
  letterSpacing?: string | number;
  textAlign?: 'left' | 'right' | 'center' | 'justify';
  growType?: 'auto-width' | 'auto-height' | 'fixed';
  showContent?: boolean;
  hideInViewer?: boolean;
  mainInstanceId?: Uuid;
  mainInstancePage?: Uuid;
  variantId?: Uuid;
  variantName?: string;
  isVariantContainer?: boolean;

  // layout
  layout?: 'flex' | 'grid';
  layoutFlexDir?: string;
  layoutGap?: PenpotLayoutGap;
  layoutGapType?: 'simple' | 'multiple';
  layoutWrapType?: 'wrap' | 'nowrap' | 'no-wrap';
  layoutPaddingType?: 'simple' | 'multiple';
  layoutPadding?: PenpotLayoutPadding;
  layoutJustifyContent?: string;
  layoutJustifyItems?: string;
  layoutAlignContent?: string;
  layoutAlignItems?: string;
  layoutGridDir?: 'row' | 'column';
  layoutItemMarginType?: 'simple' | 'multiple';
  layoutItemMargin?: { m1?: number; m2?: number; m3?: number; m4?: number };
  layoutItemMinH?: number;
  layoutItemMaxH?: number;
  layoutItemMinW?: number;
  layoutItemMaxW?: number;
  layoutItemH_Sizing?: 'fill' | 'fix' | 'auto';
  layoutItemV_Sizing?: 'fill' | 'fix' | 'auto';
  layoutItemAlignSelf?: 'start' | 'end' | 'center' | 'stretch';
  layoutItemAbsolute?: boolean;
  layoutItemZIndex?: number;
}

export interface PenpotFileMedia {
  id: Uuid;
  name?: string;
  mediaId?: Uuid;
  fileId?: Uuid;
  type?: string;
  [key: string]: unknown;
}

export interface PenpotColorAsset {
  id: Uuid;
  name?: string;
  path?: string;
  color?: string;
  opacity?: number;
  gradient?: PenpotGradient;
  image?: PenpotImageRef;
}

export interface PenpotTypographyAsset {
  id: Uuid;
  name?: string;
  path?: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textDecoration?: string;
  textTransform?: string;
}

export interface PenpotComponentAsset {
  id: Uuid;
  name?: string;
  path?: string;
  mainInstanceId?: Uuid;
  mainInstancePage?: Uuid;
  objects?: Record<string, PenpotShape>;
  variantId?: Uuid;
  [key: string]: unknown;
}

export interface PenpotToken {
  $value?: unknown;
  $type?: string;
  value?: unknown;
  type?: string;
  name?: string;
  description?: string;
  id?: Uuid;
}

export interface PenpotTokensFile {
  $metadata?: {
    tokenSetOrder?: string[];
    activeThemes?: string[];
    activeSets?: string[];
  };
  $themes?: Array<{
    id?: Uuid;
    name: string;
    group?: string;
    description?: string;
    isSource?: boolean;
  }>;
  [setName: string]: unknown;
}

export interface PenpotMediaEntry {
  /** Key used to resolve image references (media-id and/or storage object uuid). */
  ids: string[];
  bytes: Uint8Array;
  contentType: string;
  name?: string;
}

export interface PenpotFileData {
  meta: PenpotFileMeta;
  pages: PenpotPageMeta[];
  shapes: Map<Uuid, Map<Uuid, PenpotShape>>; // pageId -> shapeId -> shape
  pageRootIds: Map<Uuid, Uuid>; // pageId -> root frame shape id
  components: Map<Uuid, PenpotComponentAsset>;
  colors: Map<Uuid, PenpotColorAsset>;
  typographies: Map<Uuid, PenpotTypographyAsset>;
  tokens?: PenpotTokensFile;
  media: Map<string, PenpotFileMedia>;
}

export interface PenpotDocument {
  manifest: PenpotManifest;
  files: PenpotFileData[];
  media: Map<string, PenpotMediaEntry>; // key -> bytes/contentType
}
