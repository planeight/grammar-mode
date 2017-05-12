const parse = require("./parse")
const {buildGraph, CallEffect, PushContext} = require("./graph")
const {nullMatch, LookaheadMatch} = require("./matchexpr")

module.exports = function(file, showGraph) {
  let ast = parse(file)
  if (showGraph) return buildGraph(ast).toString()
  else return compileGrammar(ast)
}

function compileEdge(edge) {
  let parts = [], body = "", result = null
  if (edge.match instanceof LookaheadMatch)
    parts.push(`lookahead: ${JSON.stringify(edge.match.start)}, type: ${edge.match.positive ? `"~"` : `"!"`}`)
  else if (edge.match != nullMatch)
    parts.push(`match: /^(?:${edge.match.regexp()})/`)
  for (let i = 0; i < edge.effects.length; i++) {
    let effect = edge.effects[i]
    if (effect instanceof CallEffect) {
      let next = effect.hasContext && i < edge.effects.length - 1 && edge.effects[i + 1]
      if (next && next instanceof PushContext && next.context) {
        body += `  state.pushContext(${JSON.stringify(next.name)}${!next.value ? "" : ", " + JSON.stringify(next.value)})\n`
        i++
      }
      body += `  state.push(${effect.returnTo})\n`
    } else if (effect instanceof PushContext) {
      if (effect.context)
        body += `  state.pushContext(${JSON.stringify(effect.name)}${!effect.value ? "" : ", " + JSON.stringify(effect.value)})\n`
      else
        result = effect.tokenType
    }
  }
  if (edge.to)
    body += `  state.push(${edge.to})\n`
  if (result)
    body += `  return ${JSON.stringify(result)}\n`
  parts.push("apply: " + (body ? "function(state) {\n" + body + "}" : needNoop = "noop"))
  return "{" + parts.join(", ") + "}"
}

let needNoop = false

function compileGrammar(grammar) {
  let graph = buildGraph(grammar)

  let code = "", nodes = []
  needNoop = false

  for (let name in graph.nodes) {
    let edges = graph.nodes[name]
    nodes.push(`${name} = [${JSON.stringify(name)},\n${edges.map(compileEdge).join(",\n")}]`)
  }
  code += `var ${nodes.join(",\n")}\n`

  if (needNoop) code += `function noop(){}\n`

  code += `module.exports = new (require("./matcher")).GrammarMode(${graph.start}, ${graph.token})\n`

  return code
}
