export function isFigurinhaSecreta(titulo: string): boolean {
  return titulo.trim() === "???";
}

export function getImagemExibicao(titulo: string, imageUrl: string | null): string | null {
  return isFigurinhaSecreta(titulo) ? null : imageUrl;
}
