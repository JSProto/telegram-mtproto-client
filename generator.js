const fs = require('fs')
const {parse} = require('tl-parser')

const dump = json => console.log(JSON.stringify(json, (k, v) => (k == 'start' || k == 'end' ? undefined : v), '    '));

/// tl parser
const mapArgs = arg => {
    let exp = arg.argType.expression
    let hasSubExp = exp.subexpressions && exp.subexpressions.length
    let type = exp.kind ? exp.kind + exp.expression.id.name
        : hasSubExp ? exp.subexpressions.map((s, i) => i ? `<${s.id.name}>` : s.id.name).join('.') : exp.id.name

    return { name: arg.id.name, type }
}

const mapFunc = fn => {
	let subExp = fn.resultType.expression.subexpressions
	let type = fn.resultType.id.name + (subExp.length ? subExp.map(s => `.<${s.id.name}>` ).join('') : '')
    let optional = fn.optionalArgs.map(mapArgs)
    let args = fn.args.map(mapArgs)

	return { name: fn.id.name, optional, args, return: type }
}

const mapCtor = ctor => {
    if (ctor.id.name == 'vector') return;

	let sexp = ctor.resultType.expression.subexpressions
	let type = ctor.resultType.id.name + (sexp.length ? sexp.map(s => `.<${s.id.name}>` ).join('') : '')
	let args = ctor.args.map(mapArgs)

	return {
		name: ctor.id.name,
		type, args
	}
}

/// tpl

const capitalise = s => s.replace(/^./, str => str.toUpperCase())

const typeTpl = (ctor) => {
    !ctor && dump(ctor)
    return `
/**
 *
 * @see {@link https://github.com/wfjsw/telegram-core-docs/blob/master/constructor/${ctor.name}.md}
 * @typedef {${ctor.type}} ${ctor.name}` + ctor.args.map(p =>
    `\n * @property {${p.type}} ${p.name}` ).join('') + `\n */`
}

const descriptionTpl = (method) => {
    const hasParams = method.args && method.args.length
    return `
    /**
     * @see {@link https://github.com/wfjsw/telegram-core-docs/blob/master/method/${method.method}.md}` +
     `${hasParams ? '\n     * @param {object} config': ''}` +
     method.args.map(p =>  `\n     * @property {${p.type}} config.${p.name}` ).join('') + `
     * @returns {${method.return}}
     */`
}

const classTpl = (name, methods) => {
    return `class ${capitalise(name)} extends Ctor {` +
    methods.map(fn => {
        const description = descriptionTpl(fn)
        const hasParams = fn.args && fn.args.length

    return `${description}\n    ${fn.method}(${hasParams ? 'config': ''}) {
        return this.__client.request('${fn.name}'${hasParams ? ', config': ''})
    }`
    }).join('\n') + `\n}\n`
}

/// run
const output = parse(fs.readFileSync('scheme.tl').toString())

// console.log(Object.keys(output.functions.declarations))
let result = {
    functions: output.functions.declarations.map(mapFunc),
    constructors: output.constructors.declarations.map(mapCtor)
}


let types = ['number:int', 'number:double', 'number:log', 'string:bytes', 'boolean:Bool', 'Array:Vector']
    .map(t => t.split(':'))
    .map(([type, name]) => ({type, name, args: []}))
    .map(typeTpl).join('\n') + result.constructors
    .filter(c => !!c)
    .map(typeTpl).join('\n')

fs.writeFileSync('types.js', types)



const functions = result.functions.reduce((m, fn) => {
    const [ctor, method] = fn.name.split('.')
    if (!method) return m

    if (!m[ctor]) {
        m[ctor] = []
    }

    fn.method = method || ctor
    m[ctor].push(fn)

    return m
}, {})


const internal = Object.keys(functions).map(ctor => {
    return `
        /**
         * @type {${capitalise(ctor)}}
         */
        this.${ctor} = new ctor.${capitalise(ctor)}(this)`
}).join('\n')

const external = Object.keys(functions).map(capitalise).map(ctor => `MTProtoClient.${ctor} = ${ctor}`).join('\n')

let classes = Object.keys(functions).map(ctor => classTpl(ctor, functions[ctor])).join('\n')


let template = fs.readFileSync('./templates/client.js').toString()


fs.writeFileSync('index.js', template
    .replace('//classes//', classes)
    .replace('//internal//', internal)
    .replace('//external//', external)
)