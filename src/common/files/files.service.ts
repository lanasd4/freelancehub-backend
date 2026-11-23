import {
  BadRequestException,
  Injectable,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { memoryStorage } from 'multer';
import { basename, join } from 'path';

const MB = 1024 * 1024;

const IMAGES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const PDF = { 'application/pdf': '.pdf' };
const ZIP = {
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
};

export interface UploadRule {
  maxSize: number;
  maxFiles: number;
  /** mime type -> the extension we store it with (never trust the original name) */
  types: Record<string, string>;
  /** public = served statically under /uploads, private = only via guarded endpoints */
  visibility: 'public' | 'private';
  folder: string;
}

/** Every upload rule of the brief in one place. */
export const UPLOAD_RULES = {
  avatar: {
    maxSize: 2 * MB,
    maxFiles: 1,
    types: IMAGES,
    visibility: 'public',
    folder: 'avatars',
  },
  cv: {
    maxSize: 5 * MB,
    maxFiles: 1,
    types: PDF,
    visibility: 'public',
    folder: 'cvs',
  },
  attachment: {
    maxSize: 10 * MB,
    maxFiles: 5,
    types: { ...IMAGES, ...PDF, ...ZIP },
    visibility: 'public',
    folder: 'attachments',
  },
  submission: {
    maxSize: 10 * MB,
    maxFiles: 5,
    types: { ...PDF, ...ZIP },
    visibility: 'private',
    folder: 'submissions',
  },
} satisfies Record<string, UploadRule>;

export type UploadKind = keyof typeof UPLOAD_RULES;

/** Multer options: size + count limits and a type filter. Files stay in memory until validated. */
export function multerOptions(kind: UploadKind) {
  const rule: UploadRule = UPLOAD_RULES[kind];
  return {
    storage: memoryStorage(),
    limits: { fileSize: rule.maxSize, files: rule.maxFiles },
    fileFilter: (
      _req: unknown,
      file: Express.Multer.File,
      cb: (err: Error | null, accept: boolean) => void,
    ) => {
      if (rule.types[file.mimetype]) return cb(null, true);
      cb(
        new BadRequestException(
          `Unsupported file type "${file.mimetype}". Allowed: ${Object.keys(rule.types).join(', ')}`,
        ),
        false,
      );
    },
  };
}

export interface SavedFile {
  storedName: string;
  /** set for public files only */
  url?: string;
  originalName: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  readonly root = join(process.cwd(), 'uploads');

  /** Saves with a generated name (UUID + extension chosen by us). */
  async save(file: Express.Multer.File, kind: UploadKind): Promise<SavedFile> {
    const rule: UploadRule = UPLOAD_RULES[kind];
    const ext = rule.types[file.mimetype];
    if (!ext) throw new BadRequestException('Unsupported file type');
    if (file.size > rule.maxSize) throw new PayloadTooLargeException();

    const dir = this.dir(kind);
    await fs.mkdir(dir, { recursive: true });
    const storedName = `${randomUUID()}${ext}`;
    await fs.writeFile(join(dir, storedName), file.buffer);
    return {
      storedName,
      url:
        rule.visibility === 'public'
          ? `/uploads/${rule.folder}/${storedName}`
          : undefined,
      originalName: basename(file.originalname).slice(0, 200),
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  /** Saves several files; if one fails, the ones already written are removed. */
  async saveMany(files: Express.Multer.File[], kind: UploadKind) {
    const saved: SavedFile[] = [];
    try {
      for (const f of files) saved.push(await this.save(f, kind));
      return saved;
    } catch (err) {
      await this.removeMany(kind, saved);
      throw err;
    }
  }

  /** Absolute path of a stored file (name comes from our own DB). */
  path(kind: UploadKind, storedNameOrUrl: string) {
    return join(this.dir(kind), basename(storedNameOrUrl));
  }

  /** Best-effort delete given a public URL or a stored name. */
  async remove(kind: UploadKind, nameOrUrl?: string | null) {
    if (!nameOrUrl) return;
    try {
      await fs.unlink(this.path(kind, nameOrUrl)); // basename() blocks path traversal
    } catch (err) {
      this.logger.warn(
        `Could not delete ${nameOrUrl}: ${(err as Error).message}`,
      );
    }
  }

  async removeMany(kind: UploadKind, files: { storedName: string }[]) {
    await Promise.all(files.map((f) => this.remove(kind, f.storedName)));
  }

  private dir(kind: UploadKind) {
    const rule: UploadRule = UPLOAD_RULES[kind];
    return join(this.root, rule.visibility, rule.folder);
  }
}
