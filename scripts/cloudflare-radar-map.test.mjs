import assert from 'node:assert/strict'
import test from 'node:test'
import { geoCentroid, geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import worldTopo from 'world-atlas/countries-50m.json' with { type: 'json' }
import { normalizeCloudflareRadarResponse } from './build-threat-intel-snapshot.mjs'
import { buildCloudflareRadarMap } from '../src/pages/cloudflareRadarMap.js'

const countries = feature(worldTopo, worldTopo.objects.countries).features
const land = feature(worldTopo, worldTopo.objects.land)
const projection = geoNaturalEarth1().fitSize([1200, 620], land)
const path = geoPath(projection)

test('normalized Cloudflare top_0 records map directly to real country arcs', () => {
  const normalized = normalizeCloudflareRadarResponse({
    success: true,
    result: {
      meta: {
        lastUpdated: '2026-11-26T03:45:00Z',
        dateRange: [{
          startTime: '2026-11-25T03:45:00Z',
          endTime: '2026-11-26T03:45:00Z',
        }],
        normalization: 'PERCENTAGE',
        units: [{ name: 'percentage', value: '%' }],
      },
      top_0: [{
        originCountryAlpha2: 'US',
        originCountryName: 'United States',
        targetCountryAlpha2: 'IT',
        targetCountryName: 'Italy',
        value: '2.850893',
      }],
    },
  })

  const result = buildCloudflareRadarMap(
    normalized.pairs,
    countries,
    projection,
    path,
    { US: '840', IT: '380' },
  )

  assert.deepEqual(normalized.meta.dateRange, [{
    startTime: '2026-11-25T03:45:00Z',
    endTime: '2026-11-26T03:45:00Z',
  }])
  assert.deepEqual(normalized.meta.units, [{ name: 'percentage', value: '%' }])
  assert.equal(result.arcs.length, 1)
  assert.deepEqual(
    [result.arcs[0].originCountryAlpha2, result.arcs[0].targetCountryAlpha2, result.arcs[0].value],
    ['US', 'IT', 2.850893],
  )
  assert.match(result.arcs[0].d, /^M/)
})

test('Cloudflare attack arcs use the actual origin and target country geographic centroids', () => {
  const pairs = [{
    originCountryAlpha2: 'US',
    originCountryName: 'United States',
    targetCountryAlpha2: 'DE',
    targetCountryName: 'Germany',
    value: 12.5,
  }]
  const result = buildCloudflareRadarMap(
    pairs,
    countries,
    projection,
    path,
    { US: '840', DE: '276' },
  )
  const arc = result.arcs[0]
  const us = countries.find((country) => String(country.id) === '840')
  const germany = countries.find((country) => String(country.id) === '276')

  assert.equal(result.arcs.length, 1)
  assert.deepEqual(arc.originPoint, projection(geoCentroid(us)))
  assert.deepEqual(arc.targetPoint, projection(geoCentroid(germany)))
  assert.match(arc.d, /^M/)
  assert.equal(arc.value, 12.5)
})

test('maps the reported United States-to-Italy and Singapore-to-United States country pairs', () => {
  const result = buildCloudflareRadarMap([
    {
      originCountryAlpha2: 'US',
      originCountryName: 'United States',
      targetCountryAlpha2: 'IT',
      targetCountryName: 'Italy',
      value: 2.850893,
    },
    {
      originCountryAlpha2: 'SG',
      originCountryName: 'Singapore',
      targetCountryAlpha2: 'US',
      targetCountryName: 'United States',
      value: 2.564103,
    },
  ], countries, projection, path, { US: '840', IT: '380', SG: '702' })

  assert.deepEqual(result.arcs.map((arc) => [
    arc.originCountryAlpha2,
    arc.targetCountryAlpha2,
    arc.value,
  ]), [
    ['US', 'IT', 2.850893],
    ['SG', 'US', 2.564103],
  ])
  assert.ok(result.arcs.every((arc) => arc.d.startsWith('M')))
})

test('Cloudflare arc weight and country roles independently reflect reported pair percentages', () => {
  const result = buildCloudflareRadarMap([
    {
      originCountryAlpha2: 'US',
      originCountryName: 'United States',
      targetCountryAlpha2: 'DE',
      targetCountryName: 'Germany',
      value: 25,
    },
    {
      originCountryAlpha2: 'US',
      originCountryName: 'United States',
      targetCountryAlpha2: 'FR',
      targetCountryName: 'France',
      value: 4,
    },
  ], countries, projection, path, { US: '840', DE: '276', FR: '250' })

  assert.equal(result.arcs.length, 2)
  assert.ok(result.arcs[0].strokeWidth > result.arcs[1].strokeWidth)
  assert.ok(result.arcs[0].opacity > result.arcs[1].opacity)
  assert.equal(result.roles.get('840').originValue, 29)
  assert.equal(result.roles.get('276').targetValue, 25)
  assert.equal(result.roles.get('250').targetValue, 4)
  assert.ok(result.roles.get('276').targetOpacity > result.roles.get('250').targetOpacity)
})

test('a refreshed Cloudflare pair list moves target activity to the newly reported country', () => {
  const pair = {
    originCountryAlpha2: 'US',
    originCountryName: 'United States',
    targetCountryAlpha2: 'DE',
    targetCountryName: 'Germany',
    value: 12.5,
  }
  const first = buildCloudflareRadarMap([pair], countries, projection, path, { US: '840', DE: '276', FR: '250' })
  const refreshed = buildCloudflareRadarMap([
    { ...pair, targetCountryAlpha2: 'FR', targetCountryName: 'France', value: 20 },
  ], countries, projection, path, { US: '840', DE: '276', FR: '250' })

  assert.equal(first.roles.get('276').targetValue, 12.5)
  assert.equal(first.roles.has('250'), false)
  assert.equal(refreshed.roles.has('276'), false)
  assert.equal(refreshed.roles.get('250').targetValue, 20)
  assert.equal(refreshed.arcs[0].targetCountryAlpha2, 'FR')
})
