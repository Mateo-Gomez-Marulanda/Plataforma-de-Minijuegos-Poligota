# Pruebas de la lógica pura de Snake (sin procesos ni red): movimiento, giros, colisiones, comida y victoria.
defmodule Snake.Logic.JuegoTest do
  use ExUnit.Case, async: true

  alias Snake.Logic.Juego

  # Construye un estado a mano para probar situaciones concretas.
  defp juego(cuerpo, dir, extra \\ []) do
    {:ok, base} = Juego.nuevo_juego(ancho: 10, alto: 10, semilla: 1)
    struct!(base, [cuerpo: cuerpo, direccion: dir, comida: {0, 0}] ++ extra)
  end

  test "nuevo juego: serpiente de 3 en el centro y comida fuera de su cuerpo" do
    {:ok, j} = Juego.nuevo_juego(semilla: 1)
    assert j.cuerpo == [{10, 10}, {9, 10}, {8, 10}]
    assert j.comida not in j.cuerpo
    assert Juego.terminado(j) == nil
  end

  test "tamaños inválidos se rechazan" do
    assert Juego.nuevo_juego(ancho: 3) == {:error, :tamano_invalido}
    assert Juego.nuevo_juego(alto: "x") == {:error, :tamano_invalido}
  end

  test "tick mueve la cabeza y quita la cola" do
    j = Juego.tick(juego([{5, 5}, {4, 5}, {3, 5}], :right))
    assert j.cuerpo == [{6, 5}, {5, 5}, {4, 5}]
  end

  test "un giro válido se aplica en el siguiente tick" do
    j = juego([{5, 5}, {4, 5}, {3, 5}], :right) |> Juego.aplicar_accion(:up) |> Juego.tick()
    assert j.direccion == :up
    assert hd(j.cuerpo) == {5, 4}
  end

  test "el giro de 180° se ignora" do
    j = juego([{5, 5}, {4, 5}, {3, 5}], :right) |> Juego.aplicar_accion(:left) |> Juego.tick()
    assert j.direccion == :right
    assert hd(j.cuerpo) == {6, 5}
  end

  test "con varias teclas en un tick solo cuenta la primera válida" do
    j =
      juego([{5, 5}, {4, 5}, {3, 5}], :right)
      |> Juego.aplicar_accion(:up)
      |> Juego.aplicar_accion(:left)
      |> Juego.tick()

    assert j.direccion == :up
    assert Juego.terminado(j) == nil
  end

  test "una tecla igual a la dirección actual no consume el giro" do
    j =
      juego([{5, 5}, {4, 5}, {3, 5}], :right)
      |> Juego.aplicar_accion(:right)
      |> Juego.aplicar_accion(:down)

    assert j.giro == :down
  end

  test "comer hace crecer, suma puntos y recoloca la fruta" do
    j = Juego.tick(juego([{5, 5}, {4, 5}, {3, 5}], :right, comida: {6, 5}))
    assert length(j.cuerpo) == 4
    assert j.puntaje == 10
    assert j.comida != {6, 5} and j.comida not in j.cuerpo
  end

  test "chocar con un borde pierde" do
    j = Juego.tick(juego([{9, 5}, {8, 5}, {7, 5}], :right))
    assert Juego.terminado(j) == {:lost, :wall}
  end

  test "chocar con el propio cuerpo pierde" do
    cuerpo = [{5, 5}, {6, 5}, {6, 4}, {5, 4}, {4, 4}, {4, 5}, {3, 5}]
    assert Juego.terminado(Juego.tick(juego(cuerpo, :left))) == {:lost, :self}
  end

  test "entrar en la casilla de la cola es válido porque se libera en el mismo tick" do
    cuerpo = [{5, 5}, {6, 5}, {6, 4}, {5, 4}, {4, 4}, {4, 5}]
    assert Juego.terminado(Juego.tick(juego(cuerpo, :left))) == nil
  end

  test "tras perder, tick y giros ya no cambian el estado" do
    perdido = Juego.tick(juego([{9, 5}, {8, 5}, {7, 5}], :right))
    assert Juego.tick(perdido) == perdido
    assert Juego.aplicar_accion(perdido, :up) == perdido
  end

  test "llenar el tablero gana" do
    # Tablero 5x5 recorrido en zigzag: quedan 2 celdas libres y la serpiente come la última fruta.
    zigzag = for y <- 0..4, x <- if(rem(y, 2) == 0, do: 0..4, else: 4..0//-1), do: {x, y}
    cuerpo = zigzag |> Enum.take(23) |> Enum.reverse()
    [cabeza | _] = cuerpo
    {:ok, base} = Juego.nuevo_juego(ancho: 5, alto: 5, semilla: 1)
    ultima = Enum.at(zigzag, 23)
    j = struct!(base, cuerpo: cuerpo, direccion: dir_hacia(cabeza, ultima), comida: ultima)
    j = Juego.tick(j)
    assert length(j.cuerpo) == 24
    # Queda una celda libre: la fruta aparece ahí y la partida continúa.
    assert j.comida == Enum.at(zigzag, 24)
    j = struct!(j, direccion: dir_hacia(hd(j.cuerpo), j.comida)) |> Juego.tick()
    assert Juego.terminado(j) == {:won, :board_full}
  end

  # Dirección necesaria para ir de una casilla a otra adyacente.
  defp dir_hacia({x, y}, {x2, y2}) do
    cond do
      x2 > x -> :right
      x2 < x -> :left
      y2 > y -> :down
      true -> :up
    end
  end

  test "la velocidad aumenta con las frutas hasta un mínimo" do
    assert Juego.intervalo_ms(%Juego{comidas: 0}) == 150
    assert Juego.intervalo_ms(%Juego{comidas: 4}) == 130
    assert Juego.intervalo_ms(%Juego{comidas: 1000}) == 60
  end

  test "a_tablero dibuja cabeza, cuerpo y comida" do
    j = juego([{2, 1}, {1, 1}], :right, comida: {4, 3})
    tablero = Juego.a_tablero(j)
    assert length(tablero) == 10 and length(hd(tablero)) == 10
    assert Enum.at(Enum.at(tablero, 1), 2) == 2
    assert Enum.at(Enum.at(tablero, 1), 1) == 1
    assert Enum.at(Enum.at(tablero, 3), 4) == 3
  end

  test "con la misma semilla el juego es determinista" do
    {:ok, a} = Juego.nuevo_juego(semilla: 42)
    {:ok, b} = Juego.nuevo_juego(semilla: 42)
    assert a.comida == b.comida
  end
end
