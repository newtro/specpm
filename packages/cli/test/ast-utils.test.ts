import { describe, it, expect } from 'vitest'
import { Project } from 'ts-morph'
import { findExports, findFunctionCalls, findInterfaceDeclarations, getInterfaceProperties, findTypeAliases, findTryCatchWrappedCalls } from '../src/lib/checker/ast-utils.js'

function createSourceFile(code: string) {
  const project = new Project({ useInMemoryFileSystem: true })
  return project.createSourceFile('test.ts', code)
}

describe('ast-utils', () => {
  describe('findExports', () => {
    it('finds named exports', () => {
      const sf = createSourceFile(`
        export function greet() {}
        export const name = "test"
        function internal() {}
      `)
      const exports = findExports(sf)
      expect(exports.map(e => e.name)).toContain('greet')
      expect(exports.map(e => e.name)).toContain('name')
      expect(exports.map(e => e.name)).not.toContain('internal')
    })

    it('finds exported interfaces', () => {
      const sf = createSourceFile(`
        export interface User { id: string }
      `)
      const exports = findExports(sf)
      expect(exports.some(e => e.name === 'User')).toBe(true)
    })
  })

  describe('findFunctionCalls', () => {
    it('finds all function calls', () => {
      const sf = createSourceFile(`
        console.log("hello")
        bcrypt.hash("password", 12)
        fetch("/api")
      `)
      const calls = findFunctionCalls(sf)
      expect(calls.length).toBe(3)
    })

    it('filters by pattern', () => {
      const sf = createSourceFile(`
        console.log("hello")
        bcrypt.hash("password", 12)
      `)
      const calls = findFunctionCalls(sf, 'bcrypt.hash')
      expect(calls.length).toBe(1)
      expect(calls[0].name).toBe('bcrypt.hash')
    })
  })

  describe('findInterfaceDeclarations', () => {
    it('finds all interfaces', () => {
      const sf = createSourceFile(`
        interface User { id: string }
        interface Session { token: string }
      `)
      const ifaces = findInterfaceDeclarations(sf)
      expect(ifaces.length).toBe(2)
    })

    it('filters by name', () => {
      const sf = createSourceFile(`
        interface User { id: string }
        interface Session { token: string }
      `)
      const ifaces = findInterfaceDeclarations(sf, 'User')
      expect(ifaces.length).toBe(1)
      expect(ifaces[0].getName()).toBe('User')
    })
  })

  describe('getInterfaceProperties', () => {
    it('extracts property info', () => {
      const sf = createSourceFile(`
        interface User {
          id: string
          email: string
          avatar?: string
        }
      `)
      const iface = findInterfaceDeclarations(sf, 'User')[0]
      const props = getInterfaceProperties(iface)
      expect(props.length).toBe(3)
      expect(props.find(p => p.name === 'id')?.optional).toBe(false)
      expect(props.find(p => p.name === 'avatar')?.optional).toBe(true)
    })
  })

  describe('findTypeAliases', () => {
    it('finds type aliases', () => {
      const sf = createSourceFile(`
        type UserId = string
        type Role = "admin" | "user"
      `)
      const aliases = findTypeAliases(sf)
      expect(aliases.length).toBe(2)
    })
  })

  describe('findTryCatchWrappedCalls', () => {
    it('detects try-catch wrapped calls', () => {
      const sf = createSourceFile(`
        try {
          fetch("/api")
        } catch (e) {}
      `)
      const results = findTryCatchWrappedCalls(sf, 'fetch')
      expect(results.length).toBe(1)
      expect(results[0].wrapped).toBe(true)
    })

    it('detects unwrapped calls', () => {
      const sf = createSourceFile(`
        fetch("/api")
      `)
      const results = findTryCatchWrappedCalls(sf, 'fetch')
      expect(results.length).toBe(1)
      expect(results[0].wrapped).toBe(false)
    })
  })
})
