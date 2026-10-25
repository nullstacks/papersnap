/**
 * The image half of the catalogue — one entry per iLoveIMG tool.
 *
 * Kept apart from `tools.ts` so each family reads as one file: the PDF tools
 * were generated from the v1 catalogue and stay untouched, while this list is
 * hand-written and maps cleanly onto the image modules in src/tools.
 */
import type { ToolDef } from '../types';
import { IMAGE_ICON } from './imageIcons';

export const IMAGE_TOOLS: ToolDef[] = [
  {
    slug: 'compress-image',
    panelTitle: 'Compress images',
    category: 'image-optimize',
    group: 'Optimize IMAGE',
    title: 'Compress IMAGE',
    h1: 'Compress IMAGE',
    sub: 'Compress JPG, PNG, WEBP or GIF with the best quality and compression. Reduce the filesize of your images at once.',
    desc: 'Compress JPG, PNG, WEBP or GIF with the best quality and compression. Reduce the filesize of your images at once.',
    action: 'Compress IMAGES',
    accept: 'image/*',
    multiple: true,
    min: 1,
    icon: IMAGE_ICON['compress-image'],
  },
  {
    slug: 'resize-image',
    panelTitle: 'Resize options',
    category: 'image-optimize',
    group: 'Optimize IMAGE',
    title: 'Resize IMAGE',
    h1: 'Resize IMAGE',
    sub: 'Resize JPG, PNG, WEBP or GIF by defining new height and width pixels. Change image dimensions in bulk.',
    desc: 'Resize JPG, PNG, WEBP or GIF by defining new height and width pixels. Change image dimensions in bulk.',
    action: 'Resize IMAGES',
    accept: 'image/*',
    multiple: true,
    min: 1,
    icon: IMAGE_ICON['resize-image'],
  },
  {
    slug: 'upscale-image',
    /* No local equivalent of what the hosted services do with a model; see ToolDef.hidden. */
    hidden: true,
    panelTitle: 'Upscale options',
    category: 'image-optimize',
    group: 'Optimize IMAGE',
    title: 'Upscale',
    h1: 'Upscale IMAGE',
    sub: 'Enlarge your images up to 4x without losing sharpness. Give small photos the resolution they deserve.',
    desc: 'Enlarge your images up to 4x without losing sharpness. Give small photos the resolution they deserve.',
    action: 'Upscale IMAGES',
    accept: 'image/*',
    multiple: true,
    min: 1,
    icon: IMAGE_ICON['upscale-image'],
  },
  {
    slug: 'crop-image',
    panelTitle: 'Crop options',
    category: 'image-edit',
    group: 'Edit IMAGE',
    title: 'Crop IMAGE',
    h1: 'Crop IMAGE',
    sub: 'Crop JPG, PNG, WEBP or GIF with an intuitive interface. Flip, mirror and rotate your images in the same step.',
    desc: 'Crop JPG, PNG, WEBP or GIF with an intuitive interface. Flip, mirror and rotate your images in the same step.',
    action: 'Crop IMAGES',
    accept: 'image/*',
    multiple: false,
    min: 1,
    icon: IMAGE_ICON['crop-image'],
  },
  {
    slug: 'rotate-image',
    panelTitle: 'Rotate IMAGE',
    category: 'image-edit',
    group: 'Edit IMAGE',
    title: 'Rotate IMAGE',
    h1: 'Rotate IMAGE',
    sub: 'Rotate JPG, PNG, WEBP or GIF clockwise or counterclockwise. Flip images horizontally or vertically, all at once.',
    desc: 'Rotate JPG, PNG, WEBP or GIF clockwise or counterclockwise. Flip images horizontally or vertically, all at once.',
    action: 'Rotate IMAGES',
    accept: 'image/*',
    multiple: true,
    min: 1,
    icon: IMAGE_ICON['rotate-image'],
  },
  {
    slug: 'photo-editor',
    panelTitle: 'Photo editor',
    category: 'image-edit',
    group: 'Edit IMAGE',
    title: 'Photo editor',
    h1: 'Photo editor',
    sub: 'Add text, stickers, effects and filters to your photos. Edit your photos online.',
    desc: 'Add text, stickers, effects and filters to your photos. Edit your photos online.',
    action: 'Save png',
    accept: 'image/*',
    multiple: false,
    min: 1,
    icon: IMAGE_ICON['photo-editor'],
  },
  {
    slug: 'watermark-image',
    panelTitle: 'Watermark images',
    category: 'image-edit',
    group: 'Edit IMAGE',
    title: 'Watermark IMAGE',
    h1: 'Watermark IMAGE',
    sub: 'Stamp an image or text over your pictures. Position, scale and fade it exactly where you want it.',
    desc: 'Stamp an image or text over your pictures. Position, scale and fade it exactly where you want it.',
    action: 'Watermark IMAGES',
    accept: 'image/*',
    multiple: true,
    min: 1,
    icon: IMAGE_ICON['watermark-image'],
  },
  {
    slug: 'blur-face',
    panelTitle: 'Blur face options',
    category: 'image-edit',
    group: 'Edit IMAGE',
    title: 'Blur face',
    h1: 'Blur face',
    sub: 'Blur faces and sensitive details in a photo. Share it without giving away who is in it.',
    desc: 'Blur faces and sensitive details in a photo. Share it without giving away who is in it.',
    action: 'Blur IMAGES',
    accept: 'image/*',
    multiple: true,
    min: 1,
    icon: IMAGE_ICON['blur-face'],
  },
  {
    slug: 'remove-background',
    /* Same: a colour-key cut-out is not the AI result people now expect. */
    hidden: true,
    panelTitle: 'Remove background',
    category: 'image-edit',
    group: 'Edit IMAGE',
    title: 'Remove background',
    h1: 'Remove background',
    sub: 'Erase the background of your photos in one click. Get a clean cut-out ready to drop on any colour.',
    desc: 'Erase the background of your photos in one click. Get a clean cut-out ready to drop on any colour.',
    action: 'Remove background',
    accept: 'image/*',
    multiple: true,
    min: 1,
    icon: IMAGE_ICON['remove-background'],
  },
  {
    slug: 'convert-to-jpg',
    panelTitle: 'Convert to JPG',
    category: 'image-convert',
    group: 'Convert IMAGE',
    title: 'Convert to JPG',
    h1: 'Convert to JPG',
    sub: 'Convert PNG, GIF, WEBP or BMP images to JPG. Convert all your images at once.',
    desc: 'Convert PNG, GIF, WEBP or BMP images to JPG. Convert all your images at once.',
    action: 'Convert to JPG',
    accept: 'image/*',
    multiple: true,
    min: 1,
    icon: IMAGE_ICON['convert-to-jpg'],
  },
  {
    slug: 'jpg-to-image',
    panelTitle: 'JPG conversion',
    category: 'image-convert',
    group: 'Convert IMAGE',
    title: 'Convert from JPG',
    h1: 'Convert from JPG',
    sub: 'Convert your JPG images to PNG or GIF. Change the format of all your pictures in seconds.',
    desc: 'Convert your JPG images to PNG or GIF. Change the format of all your pictures in seconds.',
    action: 'Convert IMAGE',
    accept: 'image/*',
    multiple: true,
    min: 1,
    icon: IMAGE_ICON['jpg-to-image'],
  },
  {
    slug: 'html-to-image',
    panelTitle: 'HTML to image',
    category: 'image-convert',
    group: 'Convert IMAGE',
    title: 'HTML to IMAGE',
    h1: 'HTML to IMAGE',
    sub: 'Convert web pages to JPG or SVG and maintain the visual aspect.',
    desc: 'Convert web pages to JPG or SVG and maintain the visual aspect.',
    action: 'Convert to IMAGE',
    accept: '',
    multiple: false,
    min: 1,
    icon: IMAGE_ICON['html-to-image'],
  },
  {
    slug: 'meme-generator',
    panelTitle: 'Meme editor',
    category: 'image-create',
    group: 'Create IMAGE',
    title: 'Meme generator',
    h1: 'Meme generator',
    sub: 'Add text to your images and create your own memes. Put it inside or outside the picture.',
    desc: 'Add text to your images and create your own memes. Put it inside or outside the picture.',
    action: 'Generate MEME',
    accept: 'image/*',
    multiple: false,
    min: 1,
    icon: IMAGE_ICON['meme-generator'],
  },
];

export const IMAGE_TOOL_BY_SLUG: Record<string, ToolDef> = Object.fromEntries(
  IMAGE_TOOLS.map((t) => [t.slug, t]),
);

/**
 * Visibility helpers.
 *
 * A tool can be routable yet unadvertised (see ToolDef.hidden). Every navigation
 * surface goes through these two functions, so hiding a tool is one flag in the
 * catalogue rather than a change in five components.
 */
export function visible(list: ToolDef[]): ToolDef[] {
  return list.filter((tool) => !tool.hidden);
}

export function visibleSlugs(slugs: string[]): string[] {
  return slugs.filter((slug) => !IMAGE_TOOL_BY_SLUG[slug]?.hidden);
}


export interface NavGroupDef {
  title: string;
  tools: string[];
}

/** Sidebar grouping for the image family, in the reference's order. */
export const IMAGE_NAV_GROUPS: NavGroupDef[] = [
  { title: 'Optimize IMAGE', tools: ['compress-image', 'resize-image'] },
  {
    title: 'Edit IMAGE',
    tools: [
      'crop-image',
      'rotate-image',
      'photo-editor',
      'watermark-image',
      'blur-face',
    ],
  },
  { title: 'Convert IMAGE', tools: ['convert-to-jpg', 'jpg-to-image', 'html-to-image'] },
  { title: 'Create IMAGE', tools: ['meme-generator'] },
];

/** The five tools that get a top-level header link. */
export const IMAGE_NAV_PRIMARY: Array<{ slug: string; label: string }> = [
  { slug: 'compress-image', label: 'Compress IMAGE' },
  { slug: 'resize-image', label: 'Resize IMAGE' },
  { slug: 'crop-image', label: 'Crop IMAGE' },
  { slug: 'convert-to-jpg', label: 'Convert to JPG' },
  { slug: 'photo-editor', label: 'Photo editor' },
];

/** Filter chips for the image family. */
export const IMAGE_FILTERS: Array<{ id: string; label: string }> = [
  { id: 'image-optimize', label: 'Optimize IMAGE' },
  { id: 'image-edit', label: 'Edit IMAGE' },
  { id: 'image-convert', label: 'Convert IMAGE' },
  { id: 'image-create', label: 'Create IMAGE' },
];