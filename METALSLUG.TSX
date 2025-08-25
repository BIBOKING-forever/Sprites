import React, { useState, useEffect, useRef } from "react"
import { addPropertyControls, ControlType } from "framer"

type SpriteConfig = {
    name: string
    type: "gif" | "spritesheet"
    gif?: string
}

type SpritesData = {
    sprites: SpriteConfig[]
    totalSprites: number
    generated: string
}

type Enemy = {
    id: number
    sprite: SpriteConfig
    x: number
    y: number
    scale: number
    speed: number
    delay: number // Delay before starting to move
    isVehicle: boolean
}

type Props = {
    spritesJsonUrl: string
    waveInterval: number
    minSpeed: number
    maxSpeed: number
    spriteScale: number
    vehicleScale: number
    groundY: number
    spawnSide: "left" | "right" | "both"
    formationSpacing: number
    showDebugInfo: boolean
}

export default function MetalSlugWaveSpawner({
    spritesJsonUrl = "https://biboking-forever.github.io/Sprites/sprites.json",
    waveInterval = 8000,
    minSpeed = 1.5,
    maxSpeed = 3,
    spriteScale = 2,
    vehicleScale = 3,
    groundY = 0,
    spawnSide = "both",
    formationSpacing = 40,
    showDebugInfo = false,
}: Props) {
    const [spritesData, setSpritesData] = useState<SpritesData | null>(null)
    const [enemies, setEnemies] = useState<Enemy[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string>("")
    const enemyIdRef = useRef(0)
    const containerRef = useRef<HTMLDivElement>(null)
    const waveTimeoutRef = useRef<number | null>(null)

    // Categories for Metal Slug sprites
    const categorizeSprites = (sprites: SpriteConfig[]) => {
        const grunts: SpriteConfig[] = []
        const elites: SpriteConfig[] = []
        const vehicles: SpriteConfig[] = []
        
        sprites.forEach(sprite => {
            const name = sprite.name.toUpperCase()
            
            // Skip non-walking/running sprites
            if (!name.includes("-WALKING") && !name.includes("-RUNNING")) return
            
            // Categorize based on name patterns
            if (name.includes("TANK") || name.includes("VEHICLE") || name.includes("MECH")) {
                vehicles.push(sprite)
            } else if (name.includes("SOLDIER") || name.includes("GRUNT") || name.includes("ENEMY")) {
                grunts.push(sprite)
            } else if (name.includes("ELITE") || name.includes("BOSS") || name.includes("HEAVY")) {
                elites.push(sprite)
            } else {
                // Default to grunts for generic sprites
                grunts.push(sprite)
            }
        })
        
        return { grunts, elites, vehicles }
    }

    // Load sprites
    useEffect(() => {
        let cancelled = false
        const load = async () => {
            try {
                setLoading(true)
                setError("")
                const res = await fetch(spritesJsonUrl)
                if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
                const data: SpritesData = await res.json()

                const filtered = data.sprites.filter((sprite) => {
                    if (sprite.type !== "gif") return false
                    const n = sprite.name.toUpperCase()
                    return (
                        (n.includes("-WALKING-LEFT") ||
                        n.includes("-WALKING-RIGHT") ||
                        n.includes("-RUNNING-LEFT") ||
                        n.includes("-RUNNING-RIGHT")) &&
                        !n.includes("-FLYING") // Exclude flying sprites for Metal Slug feel
                    )
                })

                if (!cancelled) {
                    if (filtered.length === 0) {
                        setError("No walking/running sprites found.")
                    } else {
                        setSpritesData({ ...data, sprites: filtered })
                    }
                }
            } catch (e: any) {
                if (!cancelled) setError(`Failed to load sprites: ${e.message}`)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        load()
        return () => { cancelled = true }
    }, [spritesJsonUrl])

    // Spawn a wave of enemies
    const spawnWave = () => {
        if (!spritesData?.sprites.length) return
        
        const { grunts, elites, vehicles } = categorizeSprites(spritesData.sprites)
        const containerHeight = containerRef.current?.offsetHeight || 400
        const viewportWidth = window.innerWidth
        
        // Determine spawn direction
        let direction: "left" | "right"
        if (spawnSide === "both") {
            direction = Math.random() > 0.5 ? "left" : "right"
        } else {
            direction = spawnSide
        }
        
        const newEnemies: Enemy[] = []
        let xOffset = 0
        
        // Decide wave composition
        const waveRoll = Math.random()
        
        if (waveRoll < 0.1 && vehicles.length > 0) {
            // 10% chance: Vehicle wave (1 vehicle + 2-3 grunts)
            const vehicle = vehicles[Math.floor(Math.random() * vehicles.length)]
            const vehicleSprite = direction === "left" 
                ? vehicle.name.replace("-LEFT", "-RIGHT") 
                : vehicle.name.replace("-RIGHT", "-LEFT")
            
            // Find the correct directional sprite
            const correctVehicle = spritesData.sprites.find(s => 
                s.name === vehicleSprite
            ) || vehicle
            
            // Spawn vehicle
            newEnemies.push({
                id: enemyIdRef.current++,
                sprite: correctVehicle,
                x: direction === "left" ? -200 - xOffset : viewportWidth + 200 + xOffset,
                y: containerHeight - groundY,
                scale: vehicleScale,
                speed: minSpeed, // Vehicles move slower
                delay: 0,
                isVehicle: true,
            })
            xOffset += formationSpacing * 2
            
            // Add escort grunts
            const escortCount = 2 + Math.floor(Math.random() * 2)
            for (let i = 0; i < escortCount && grunts.length > 0; i++) {
                const grunt = grunts[Math.floor(Math.random() * grunts.length)]
                const gruntSprite = direction === "left"
                    ? grunt.name.replace("-LEFT", "-RIGHT")
                    : grunt.name.replace("-RIGHT", "-LEFT")
                    
                const correctGrunt = spritesData.sprites.find(s => 
                    s.name === gruntSprite
                ) || grunt
                
                newEnemies.push({
                    id: enemyIdRef.current++,
                    sprite: correctGrunt,
                    x: direction === "left" ? -200 - xOffset : viewportWidth + 200 + xOffset,
                    y: containerHeight - groundY + (Math.random() * 20 - 10), // Slight Y variation
                    scale: spriteScale,
                    speed: minSpeed + Math.random() * (maxSpeed - minSpeed),
                    delay: i * 200, // Staggered movement
                    isVehicle: false,
                })
                xOffset += formationSpacing
            }
        } else if (waveRoll < 0.3 && elites.length > 0) {
            // 20% chance: Elite wave (1-2 elites + 1-2 grunts)
            const eliteCount = 1 + Math.floor(Math.random() * 2)
            for (let i = 0; i < eliteCount; i++) {
                const elite = elites[Math.floor(Math.random() * elites.length)]
                const eliteSprite = direction === "left"
                    ? elite.name.replace("-LEFT", "-RIGHT")
                    : elite.name.replace("-RIGHT", "-LEFT")
                    
                const correctElite = spritesData.sprites.find(s => 
                    s.name === eliteSprite
                ) || elite
                
                newEnemies.push({
                    id: enemyIdRef.current++,
                    sprite: correctElite,
                    x: direction === "left" ? -200 - xOffset : viewportWidth + 200 + xOffset,
                    y: containerHeight - groundY,
                    scale: spriteScale * 1.2, // Elites slightly bigger
                    speed: minSpeed + Math.random() * (maxSpeed - minSpeed),
                    delay: i * 300,
                    isVehicle: false,
                })
                xOffset += formationSpacing * 1.5
            }
        } else {
            // 70% chance: Grunt wave (3-6 grunts)
            const gruntCount = 3 + Math.floor(Math.random() * 4)
            const useFormation = Math.random() > 0.3 // 70% chance of formation
            
            for (let i = 0; i < gruntCount && grunts.length > 0; i++) {
                const grunt = grunts[Math.floor(Math.random() * grunts.length)]
                const gruntSprite = direction === "left"
                    ? grunt.name.replace("-LEFT", "-RIGHT")
                    : grunt.name.replace("-RIGHT", "-LEFT")
                    
                const correctGrunt = spritesData.sprites.find(s => 
                    s.name === gruntSprite
                ) || grunt
                
                const yVariation = useFormation ? 0 : (Math.random() * 30 - 15)
                const delayVariation = useFormation ? i * 100 : Math.random() * 500
                
                newEnemies.push({
                    id: enemyIdRef.current++,
                    sprite: correctGrunt,
                    x: direction === "left" ? -200 - xOffset : viewportWidth + 200 + xOffset,
                    y: containerHeight - groundY + yVariation,
                    scale: spriteScale,
                    speed: minSpeed + Math.random() * (maxSpeed - minSpeed),
                    delay: delayVariation,
                    isVehicle: false,
                })
                xOffset += useFormation ? formationSpacing : formationSpacing * (0.5 + Math.random())
            }
        }
        
        setEnemies(prev => [...prev, ...newEnemies])
    }

    // Wave spawning interval
    useEffect(() => {
        if (!spritesData?.sprites.length) return
        
        const clearWaveTimeout = () => {
            if (waveTimeoutRef.current != null) {
                clearTimeout(waveTimeoutRef.current)
                waveTimeoutRef.current = null
            }
        }
        
        // Initial wave
        const initialTimeout = setTimeout(() => spawnWave(), 1000)
        
        // Recurring waves
        const scheduleNextWave = () => {
            clearWaveTimeout()
            waveTimeoutRef.current = window.setTimeout(() => {
                spawnWave()
                scheduleNextWave()
            }, waveInterval)
        }
        
        scheduleNextWave()
        
        return () => {
            clearTimeout(initialTimeout)
            clearWaveTimeout()
        }
    }, [spritesData, waveInterval, minSpeed, maxSpeed, spriteScale, vehicleScale, groundY, spawnSide, formationSpacing])

    // Movement animation
    useEffect(() => {
        const startTime = Date.now()
        
        const step = () => {
            const currentTime = Date.now()
            const elapsed = currentTime - startTime
            const viewportWidth = window.innerWidth
            
            setEnemies(prev =>
                prev
                    .map(enemy => {
                        // Only move if delay has passed
                        if (elapsed < enemy.delay) return enemy
                        
                        // Determine direction based on spawn position
                        const movingRight = enemy.x < viewportWidth / 2
                        
                        return {
                            ...enemy,
                            x: enemy.x + (movingRight ? enemy.speed : -enemy.speed),
                        }
                    })
                    .filter(enemy =>
                        (enemy.x > -300 && enemy.x < viewportWidth + 300)
                    )
            )
        }
        
        const interval = window.setInterval(step, 16)
        return () => window.clearInterval(interval)
    }, [])

    if (loading) return (
        <div style={{ 
            width: "100%", 
            height: "100%", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            color: "gray" 
        }}>
            Loading Metal Slug sprites...
        </div>
    )
    
    if (error) return (
        <div style={{ 
            width: "100%", 
            height: "100%", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            color: "red",
            padding: 20,
            textAlign: "center"
        }}>
            {error}
        </div>
    )

    return (
        <div
            ref={containerRef}
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                overflow: "visible",
                pointerEvents: "none",
            }}
        >
            {showDebugInfo && (
                <div
                    style={{
                        position: "absolute",
                        top: 10,
                        left: 10,
                        background: "rgba(0,0,0,0.8)",
                        color: "white",
                        padding: 10,
                        borderRadius: 5,
                        fontSize: 12,
                        zIndex: 1000,
                        pointerEvents: "auto",
                    }}
                >
                    Enemies: {enemies.length} | Vehicles: {enemies.filter(e => e.isVehicle).length}
                </div>
            )}

            {enemies.map(enemy => (
                <img
                    key={enemy.id}
                    src={enemy.sprite.gif}
                    alt={enemy.sprite.name}
                    draggable={false}
                    style={{
                        position: "absolute",
                        left: `${enemy.x}px`,
                        top: `${enemy.y}px`,
                        imageRendering: "pixelated",
                        transform: `scale(${enemy.scale})`,
                        transformOrigin: "bottom center",
                        pointerEvents: "none",
                    }}
                />
            ))}
        </div>
    )
}

addPropertyControls(MetalSlugWaveSpawner, {
    spritesJsonUrl: {
        type: ControlType.String,
        title: "Sprites JSON URL",
        defaultValue: "https://biboking-forever.github.io/Sprites/sprites.json",
    },
    waveInterval: {
        type: ControlType.Number,
        title: "Wave Interval (ms)",
        min: 3000,
        max: 20000,
        step: 1000,
        defaultValue: 8000,
        displayStepper: true,
    },
    minSpeed: {
        type: ControlType.Number,
        title: "Min Speed",
        min: 0.5,
        max: 5,
        step: 0.5,
        defaultValue: 1.5,
        displayStepper: true,
    },
    maxSpeed: {
        type: ControlType.Number,
        title: "Max Speed",
        min: 1,
        max: 10,
        step: 0.5,
        defaultValue: 3,
        displayStepper: true,
    },
    spriteScale: {
        type: ControlType.Number,
        title: "Sprite Scale",
        min: 1,
        max: 5,
        step: 0.5,
        defaultValue: 2,
        displayStepper: true,
    },
    vehicleScale: {
        type: ControlType.Number,
        title: "Vehicle Scale",
        min: 2,
        max: 8,
        step: 0.5,
        defaultValue: 3,
        displayStepper: true,
    },
    groundY: {
        type: ControlType.Number,
        title: "Ground Y Offset",
        min: 0,
        max: 200,
        step: 10,
        defaultValue: 0,
        displayStepper: true,
    },
    spawnSide: {
        type: ControlType.Enum,
        title: "Spawn Side",
        options: ["left", "right", "both"],
        optionTitles: ["Left Only", "Right Only", "Random Side"],
        defaultValue: "both",
    },
    formationSpacing: {
        type: ControlType.Number,
        title: "Formation Spacing",
        min: 20,
        max: 100,
        step: 5,
        defaultValue: 40,
        displayStepper: true,
    },
    showDebugInfo: {
        type: ControlType.Boolean,
        title: "Show Debug Info",
        defaultValue: false,
    },
})
