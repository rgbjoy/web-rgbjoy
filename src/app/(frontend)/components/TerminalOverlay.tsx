'use client'
import React, { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import style from './terminalOverlay.module.scss'
import useLocalStorage from '../hooks/useLocalStorage'
import { Post } from '@payload-types'

const TerminalOverlay = ({ postsData }: { postsData: Post[] }) => {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState<string[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [currentDirectory, setCurrentDirectory] = useState('')
  const [playerHand, setPlayerHand] = useState<(string | number)[]>([])
  const [dealerHand, setDealerHand] = useState<(string | number)[]>([])
  const [gameActive, setGameActive] = useState(false)
  const [wins, setWins] = useLocalStorage('blackjackWins', 0)
  const [losses, setLosses] = useLocalStorage('blackjackLosses', 0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const router = useRouter()

  const posts = postsData

  const drawCard = (): number | string => {
    const cards = [2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A'] as const
    return cards[Math.floor(Math.random() * cards.length)] as number | string
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
  }

  const updateWins = (newWins) => {
    setWins(newWins)
  }

  const updateLosses = (newLosses) => {
    setLosses(newLosses)
  }

  const handleInputSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const newOutput = [...output, `${prompt} ${input}`]

    // Blackjack game state
    const startBlackjack = () => {
      const initialPlayerHand = [drawCard(), drawCard()]
      const initialDealerHand = [drawCard(), drawCard()]
      setPlayerHand(initialPlayerHand)
      setDealerHand(initialDealerHand)
      setGameActive(true)

      const playerValue = calculateHandValue(initialPlayerHand)
      const dealerValue = calculateHandValue(initialDealerHand)

      if (playerValue === 21) {
        if (dealerValue === 21) {
          setOutput([
            ...newOutput,
            `Starting Blackjack...`,
            `Your hand: ${initialPlayerHand.join(', ')}`,
            `Dealer's hand: ${initialDealerHand.join(', ')}. It's a tie!`,
          ])
        } else {
          setOutput([
            ...newOutput,
            `Starting Blackjack...`,
            `Your hand: ${initialPlayerHand.join(', ')}. Blackjack! You win!`,
            `Well done! Type 'blackjack' to play again.`,
          ])
          updateWins(wins + 1)
        }
        setGameActive(false)
      } else {
        setOutput([
          ...newOutput,
          `Starting Blackjack...`,
          `Your hand: ${initialPlayerHand.join(', ')}`,
        ])
      }
    }

    const calculateHandValue = (hand: (number | string)[]) => {
      let value = 0
      let aces = 0

      hand.forEach((card) => {
        if (typeof card === 'number') {
          value += card
        } else if (card === 'A') {
          aces += 1
          value += 11
        } else {
          value += 10
        }
      })

      while (value > 21 && aces > 0) {
        value -= 10
        aces -= 1
      }

      return value
    }

    if (input.trim() === '?') {
      setOutput([
        ...newOutput,
        `Welcome to the terminal.
------------------------------
?\t\t\tfor help.
ls\t\t\tlist directories.
cd <directory>\tchange directory.
clear\t\t\tclear the terminal.
exit\t\t\tclose the terminal.
blackjack <option>\tstart blackjack. Options: 'stats' to view stats, 'clear' to clear stats.
------------------------------
`,
      ])
    } else if (input.trim() === 'ls') {
      if (currentDirectory.startsWith('Posts/')) {
        setOutput([...newOutput, ''])
      } else if (currentDirectory === 'Posts') {
        setOutput([...newOutput, `${posts.map((post) => post.slug).join('\t')}`])
      } else {
        setOutput([...newOutput, `Info\tDev\tArt\tPosts`])
      }
    } else if (input.trim() === 'blackjack') {
      startBlackjack()
    } else if (gameActive && input.trim() === 'hit') {
      const newCard = drawCard()
      const newPlayerHand = [...playerHand, newCard]
      setPlayerHand(newPlayerHand)
      const playerValue = calculateHandValue(newPlayerHand)
      if (playerValue > 21) {
        setOutput([
          ...newOutput,
          `You drew a ${newCard}. Your hand: ${newPlayerHand.join(', ')}. Bust!`,
          `Type 'blackjack' to play again.`,
        ])
        setGameActive(false)
      } else {
        setOutput([
          ...newOutput,
          `You drew a ${newCard}. Your hand: ${newPlayerHand.join(', ')}.`,
          `Type 'stand' to end your turn or 'hit' to draw another card.`,
        ])
      }
    } else if (gameActive && input.trim() === 'stand') {
      const playerValue = calculateHandValue(playerHand)
      let dealerValue = calculateHandValue(dealerHand)
      while (dealerValue < 17) {
        const newCard = drawCard()
        dealerHand.push(newCard)
        dealerValue = calculateHandValue(dealerHand)
      }
      if (dealerValue > 21 || playerValue > dealerValue) {
        setOutput([
          ...newOutput,
          `Dealer's hand: ${dealerHand.join(', ')}. You win!`,
          `Type 'blackjack' to play again.`,
        ])
        updateWins(wins + 1)
      } else if (playerValue < dealerValue) {
        setOutput([
          ...newOutput,
          `Dealer's hand: ${dealerHand.join(', ')}. You lose!`,
          `Type 'blackjack' to play again.`,
        ])
        updateLosses(losses + 1)
      } else {
        setOutput([
          ...newOutput,
          `Dealer's hand: ${dealerHand.join(', ')}. It's a tie!`,
          `Type 'blackjack' to play again.`,
        ])
      }
      setGameActive(false)
    } else if (input.trim() === 'cd') {
      setOutput([...newOutput, `Returning to home directory`])
      setCurrentDirectory('')
      router.push('/')
    } else if (input.trim() === 'cd Info') {
      setOutput([...newOutput, `Changing directory to Info`])
      setCurrentDirectory('Info')
      router.push('/info')
    } else if (input.trim() === 'cd Dev') {
      setOutput([...newOutput, `Changing directory to Dev`])
      setCurrentDirectory('Dev')
      router.push('/dev')
    } else if (input.trim() === 'cd Art') {
      setOutput([...newOutput, `Changing directory to Art`])
      setCurrentDirectory('Art')
      router.push('/art')
    } else if (input.trim() === 'cd Posts') {
      setOutput([...newOutput, `Changing directory to Posts`])
      setCurrentDirectory('Posts')
      router.push('/posts')
    } else if (currentDirectory === 'Posts' && input.trim().startsWith('cd ')) {
      const postSlug = input.trim().split(' ')[1]
      if (posts.some((post) => post.slug === postSlug)) {
        setOutput([...newOutput, `Changing directory to Posts/${postSlug}`])
        setCurrentDirectory(`Posts/${postSlug}`)
        router.push(`/posts/${postSlug}`)
      } else {
        setOutput([...newOutput, `Unknown post: ${postSlug}.`])
      }
    } else if (input.trim() === 'clear') {
      setOutput([])
    } else if (input.trim() === 'q') {
      setIsOpen(false)
    } else if (input.trim() === 'exit') {
      setIsOpen(false)
    } else if (input.trim() === 'blackjack stats') {
      setOutput([...newOutput, `Blackjack Stats: Wins - ${wins}, Losses - ${losses}`])
    } else if (input.trim() === 'blackjack clear') {
      updateWins(0)
      updateLosses(0)
      setOutput([...newOutput, `Blackjack stats cleared.`])
    } else if (input.trim() === 'doom') {
      toggleDoomAudio(newOutput)
    } else {
      setOutput([...newOutput, `Unknown command: ${input}. Type ? for help.`])
    }
    setInput('')
  }

  const prompt = `user@rgbjoy:${currentDirectory ? `~/${currentDirectory}` : '~'}${gameActive ? ' (blackjack)' : ''}$`

  const directories = [
    'Info',
    'Dev',
    'Art',
    'Posts',
    'blackjack',
    ...(Array.isArray(posts) ? posts.map((post) => post.slug) : []),
  ]

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const currentInput = input.trim()
      const match = currentInput.match(/^(.*\s)?(\S*)$/)

      if (match) {
        const prefix = match[1] || ''
        const dirInput = match[2] || ''
        const matchingDirs = directories.filter((dir) => dir?.startsWith(dirInput))

        if (matchingDirs.length === 1) {
          setInput(`${prefix}${matchingDirs[0]}`)
        }
      }
    }
  }

  const toggleDoomAudio = (newOutput: string[]) => {
    if (audioRef.current) {
      if (!audioRef.current.paused) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        setOutput([...newOutput, `Stopping At Doom's Gate.`])
      } else {
        audioRef.current.play()
        setOutput([...newOutput, `Playing At Doom's Gate...`])
      }
    }
  }

  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (inputRef.current && !(inputRef.current as Node).contains(e.target as Node)) {
        e.preventDefault()
        inputRef.current.focus()
      }
    }

    document.addEventListener('click', handleDocumentClick)

    return () => {
      document.removeEventListener('click', handleDocumentClick)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  if (!isOpen)
    return (
      <>
        <div className={style.terminalButton} onClick={() => setIsOpen(true)}>
          π
        </div>
      </>
    )

  return (
    <div className={style.terminalOverlay}>
      <div className={style.terminalBody}>
        {output.map((line, index) => (
          <div key={index} className={style.terminalOutput}>
            {line.split('\n').map((part, i) => (
              <div key={i}>{part}</div>
            ))}
          </div>
        ))}
        <form onSubmit={handleInputSubmit} className={style.terminalForm}>
          <span className={style.prompt}>{prompt}</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            className={style.terminalInput}
            autoFocus
          />
        </form>
        <audio ref={audioRef} src="/doom.ogg" />
      </div>
    </div>
  )
}

export default TerminalOverlay
