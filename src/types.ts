export type TableSection = {
  kind: 'table';
  title: string;
  columns: string[];
  rows: Record<string, string>[];
};

export type SkinItem = {
  name: string;
  thumb: string;
  full: string;
};

export type SkinSection = {
  kind: 'skins';
  title: string;
  items: SkinItem[];
};

export type ReportSection = TableSection | SkinSection;

export type Report = {
  note: string;
  updatedAt: string;
  sections: ReportSection[];
};
