/*
 * Przechwycenie wskaźnika, które nie wywraca gestu.
 *
 * setPointerCapture sprawia, że kolejne zdarzenia palca albo myszy trafiają dalej do
 * tego samego elementu, nawet gdy kursor zjedzie poza jego obszar. Bez tego przeciąganie
 * mapy urywa się przy krawędzi okna.
 *
 * Przeglądarka rzuca jednak NotFoundError, kiedy w chwili wywołania nie ma już aktywnego
 * wskaźnika o takim numerze. Dzieje się tak przy bardzo krótkim dotknięciu, gdy palec
 * odrywa się zanim Reakt zdąży uruchomić własną obsługę zdarzenia, przy dotknięciu
 * przerwanym przez system i w kilku sytuacjach na Safari z rysikiem.
 *
 * Wyjątek leciał wtedy przez całą obsługę pointerdown i przerywał ją w połowie. Przy
 * dwóch palcach kończyło się to najgorzej: pierwszy palec był już zapisany na liście
 * aktywnych, a ustawienie szczypania nie zdążyło się wykonać, więc mapa do końca sesji
 * uważała, że jeden palec ciągle dotyka ekranu.
 *
 * Samo przechwycenie jest wygodą, nie warunkiem działania. Kiedy się nie uda, gest
 * dalej działa, tylko urywa się po wyjściu poza element. Dlatego niepowodzenie
 * pomijamy, a reszta obsługi idzie swoim torem.
 */
export function przechwycWskaznik(element: Element | null, pointerId: number): boolean {
  if (!element) return false;
  try {
    element.setPointerCapture(pointerId);
    return true;
  } catch {
    return false;
  }
}
