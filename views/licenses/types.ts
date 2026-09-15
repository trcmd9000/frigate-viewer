export interface LicenseDocument {
  file: string;
  text: string;
}

export interface JavaScriptLicense {
  name: string;
  version: string;
  license: string;
  repository?: string;
  overrideReason?: string;
  licenseFiles: LicenseDocument[];
  noticeFiles: LicenseDocument[];
}

export interface JavaScriptLicenseCatalog {
  schemaVersion: number;
  packages: JavaScriptLicense[];
}
