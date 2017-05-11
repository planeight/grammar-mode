class Context {
  constructor(name, value, depth, parent) {
    this.name = name
    this.value = value
    this.depth = depth
    this.parent = parent
  }
}

class LineEndStream {
  constructor() {
    this.pos = 0
  }

  match(re) {
    let match = re.exec("\n")
    if (!match) return false
    if (match[0].length) this.pos = 1
    return true
  }

  get start() { return 0 }
}

function lookahead(edge, stream) {
  throw new Error("FIXME")
}

function matchEdge(node, stream) {
  for (let i = 1; i < node.length; i++) {
    let edge = node[i]
    if (edge.lookahead ? lookahead(edge, stream) : edge.match ? stream.match(edge.match) : true)
      return edge
  }
}

class State {
  constructor(stack, context) {
    this.stack = stack
    this.context = context
  }

  forward(stream) {
    for (;;) {
      let edge = matchEdge(this.stack[this.stack.length - 1], stream)
      if (!edge) return false
      this.stack.pop()
      this.popContext()
      edge.apply(this)
      if (stream.pos > stream.start) return true
    }
  }

  forwardAndUnwind(stream) {
    for (let depth = this.stack.length - 1;;) {
      let edge = matchEdge(this.stack[depth], stream)
      matched: if (edge) {
        let progress = stream.pos > stream.start
        if (depth == this.stack.length - 1) {
          // Regular continuation of the current state
          this.stack.pop()
        } else if (progress) {
          // Unwinding some of the stack to continue after a mismatch.
          // Can use this state object because we already know there's
          // progress and we'll commit to this unwinding
          this.stack.length = depth
        } else {
          // Speculatively forward with a copy of the state when
          // encountering a null match during unwinding, since we only
          // want to commit to it when it matches something
          let copy = new State(this.stack.slice(0, depth + 1), this.context)
          if (copy.forward(stream)) {
            this.stack = copy.stack
            this.context = copy.context
            return
          } else {
            break matched
          }
        }
        this.popContext()
        edge.apply(this)
        if (progress) return
        depth = this.stack.length - 1
        continue
      }
      // No matching edge, unwind if possible, match a generic token and try again otherwise
      if (depth) depth--
      else depth = this.stack.push(_TOKEN) - 1
    }
  }

  token(stream) {
    this.forwardAndUnwind(stream)
    let context = this.context
    if (stream.eol()) this.forwardAndUnwind(new LineEndStream)
    for (; context; context = context.parent)
      if (typeof context.value == "string") return context.value
  }

  push(node) {
    this.stack[this.stack.length] = node
  }

  pushContext(name, value) {
    this.context = new Context(name, value, this.stack.length, this.context)
  }

  popContext() {
    while (this.context && this.stack.length <= this.context.depth)
      this.context = this.context.parent
  }

  copy() {
    return new State(this.stack.slice(), this.context)
  }
}

class GrammarMode {
  constructor(startNode) {
    this.startNode = startNode
  }

  startState() { return new State([this.startNode], null) }

  copyState(state) { return state.copy() }

  token(stream, state) {
    return state.token(stream)
  }

  blankLine(state) {
    return state.forward(null)
  }
}