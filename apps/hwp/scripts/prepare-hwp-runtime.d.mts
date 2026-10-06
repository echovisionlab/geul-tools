export interface HwpRuntimeDescriptor {
  buildId: string;
  basePath: string;
  sourceCommit: string;
  sha256: string;
  archivePackage: string;
  archivePath: string;
}

export function prepareHwpRuntime(options?: {
  projectDirectory?: string;
  descriptor?: HwpRuntimeDescriptor;
}): Promise<{ outputDirectory: string; reused: boolean }>;
