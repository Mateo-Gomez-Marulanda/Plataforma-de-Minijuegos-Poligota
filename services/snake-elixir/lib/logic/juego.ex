# Lógica pura de Snake: estado de la partida y reglas (movimiento, giros, colisiones, comida).
# No conoce procesos, WebSockets ni JSON: cada función recibe un estado y devuelve otro.
# La usa Snake.Server.Partida, que llama a tick/1 con un temporizador.
defmodule Snake.Logic.Juego do
  @moduledoc "Estado y reglas del juego Snake sobre una cuadrícula."

  @direcciones [:up, :down, :left, :right]
  @puntos_por_comida 10
  @intervalo_inicial 150
  @intervalo_minimo 60
  @tamano_minimo 5
  @tamano_maximo 50

  # `cuerpo` es una lista de {x, y} con la cabeza primero.
  # `giro` guarda el giro pedido para el próximo tick (solo cuenta el primero válido).
  # `rand` es el estado del generador aleatorio, para que el juego sea determinista con semilla.
  defstruct ancho: 20,
            alto: 20,
            cuerpo: [],
            direccion: :right,
            giro: nil,
            comida: nil,
            puntaje: 0,
            comidas: 0,
            estado: :playing,
            razon: nil,
            rand: nil

  @doc "Crea una partida. Opciones: :ancho, :alto (5..50) y :semilla (para pruebas)."
  def nuevo_juego(opciones \\ []) do
    ancho = Keyword.get(opciones, :ancho, 20)
    alto = Keyword.get(opciones, :alto, 20)

    if tamano_valido?(ancho) and tamano_valido?(alto) do
      {cx, cy} = {div(ancho, 2), div(alto, 2)}
      semilla = Keyword.get_lazy(opciones, :semilla, fn -> :erlang.unique_integer() end)

      {:ok,
       colocar_comida(%__MODULE__{
         ancho: ancho,
         alto: alto,
         cuerpo: [{cx, cy}, {cx - 1, cy}, {cx - 2, cy}],
         rand: :rand.seed_s(:exsss, semilla)
       })}
    else
      {:error, :tamano_invalido}
    end
  end

  # Un tamaño es válido si es un entero dentro de los límites.
  defp tamano_valido?(n), do: is_integer(n) and n in @tamano_minimo..@tamano_maximo

  @doc "Registra un giro para el próximo tick. Ignora el giro de 180° y, si ya hay uno pedido, los siguientes."
  def aplicar_accion(%__MODULE__{estado: :playing, giro: nil, direccion: actual} = juego, dir)
      when dir in @direcciones do
    if dir == actual or dir == opuesta(actual), do: juego, else: %{juego | giro: dir}
  end

  def aplicar_accion(%__MODULE__{} = juego, dir) when dir in @direcciones, do: juego

  @doc "Avanza un paso: mueve la cabeza, detecta colisiones y gestiona la comida."
  def tick(%__MODULE__{estado: :playing} = juego) do
    dir = juego.giro || juego.direccion
    juego = %{juego | direccion: dir, giro: nil}
    [cabeza | _] = juego.cuerpo
    nueva = mover(cabeza, dir)
    come? = nueva == juego.comida

    # Si no come, la cola se libera en este mismo tick, así que se puede entrar en su casilla.
    ocupadas = if come?, do: juego.cuerpo, else: Enum.drop(juego.cuerpo, -1)

    cond do
      fuera?(nueva, juego) -> terminar(juego, :wall)
      MapSet.member?(MapSet.new(ocupadas), nueva) -> terminar(juego, :self)
      come? -> comer(juego, nueva)
      true -> %{juego | cuerpo: [nueva | ocupadas]}
    end
  end

  def tick(%__MODULE__{} = juego), do: juego

  @doc "Resultado de la partida: nil si sigue, o {:lost | :won, razón}."
  def terminado(%__MODULE__{estado: :playing}), do: nil
  def terminado(%__MODULE__{estado: estado, razon: razon}), do: {estado, razon}

  @doc "Milisegundos entre ticks: la serpiente acelera con cada fruta, hasta un mínimo."
  def intervalo_ms(%__MODULE__{comidas: comidas}) do
    max(@intervalo_minimo, @intervalo_inicial - 5 * comidas)
  end

  @doc "Matriz para dibujar (filas de arriba abajo): 0 vacío, 1 cuerpo, 2 cabeza, 3 comida."
  def a_tablero(%__MODULE__{cuerpo: [cabeza | cola]} = juego) do
    celdas =
      %{}
      |> poner(juego.comida, 3)
      |> then(fn m -> Enum.reduce(cola, m, &poner(&2, &1, 1)) end)
      |> poner(cabeza, 2)

    for y <- 0..(juego.alto - 1),
        do: for(x <- 0..(juego.ancho - 1), do: Map.get(celdas, {x, y}, 0))
  end

  # Añade una celda al mapa del tablero; ignora nil (por ejemplo, sin comida al ganar).
  defp poner(mapa, nil, _valor), do: mapa
  defp poner(mapa, pos, valor), do: Map.put(mapa, pos, valor)

  # Crece, suma puntos y coloca una nueva fruta.
  defp comer(juego, nueva) do
    colocar_comida(%{
      juego
      | cuerpo: [nueva | juego.cuerpo],
        puntaje: juego.puntaje + @puntos_por_comida,
        comidas: juego.comidas + 1
    })
  end

  # Elige al azar una celda libre; si no queda ninguna, la serpiente llenó el tablero y se gana.
  defp colocar_comida(juego) do
    ocupadas = MapSet.new(juego.cuerpo)

    libres =
      for y <- 0..(juego.alto - 1),
          x <- 0..(juego.ancho - 1),
          not MapSet.member?(ocupadas, {x, y}),
          do: {x, y}

    case libres do
      [] ->
        %{juego | comida: nil, estado: :won, razon: :board_full}

      _ ->
        {i, rand} = :rand.uniform_s(length(libres), juego.rand)
        %{juego | comida: Enum.at(libres, i - 1), rand: rand}
    end
  end

  # Marca la partida como perdida con su motivo (:wall o :self).
  defp terminar(juego, razon), do: %{juego | estado: :lost, razon: razon}

  # Posición siguiente al avanzar en una dirección (y crece hacia abajo).
  defp mover({x, y}, :up), do: {x, y - 1}
  defp mover({x, y}, :down), do: {x, y + 1}
  defp mover({x, y}, :left), do: {x - 1, y}
  defp mover({x, y}, :right), do: {x + 1, y}

  # Indica si una posición queda fuera de la cuadrícula.
  defp fuera?({x, y}, juego), do: x < 0 or y < 0 or x >= juego.ancho or y >= juego.alto

  # Dirección contraria a la dada.
  defp opuesta(:up), do: :down
  defp opuesta(:down), do: :up
  defp opuesta(:left), do: :right
  defp opuesta(:right), do: :left
end
