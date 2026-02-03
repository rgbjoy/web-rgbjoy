'use client'
import React, { useState, useRef, useEffect } from 'react'
import style from './terminalOverlay.module.css'
import useLocalStorage from '../hooks/useLocalStorage'

const TerminalOverlay = () => {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState<string[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [playerHand, setPlayerHand] = useState<(string | number)[]>([])
  const [dealerHand, setDealerHand] = useState<(string | number)[]>([])
  const [gameActive, setGameActive] = useState(false)
  const [wins, setWins] = useLocalStorage('blackjackWins', 0)
  const [losses, setLosses] = useLocalStorage('blackjackLosses', 0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const PLAY_AGAIN_MESSAGE = `Type 'blackjack' to play again.`

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
            `Dealer's hand: ${initialDealerHand.join(', ')}. It's a push!`,
          ])
        } else {
          setOutput([
            ...newOutput,
            `Starting Blackjack...`,
            `Your hand: ${initialPlayerHand.join(', ')}. Blackjack! You win!`,
            `Well done! ${PLAY_AGAIN_MESSAGE}`,
          ])
          updateWins(wins + 1)
        }
        setGameActive(false)
      } else if (dealerValue === 21) {
        setOutput([
          ...newOutput,
          `Starting Blackjack...`,
          `Your hand: ${initialPlayerHand.join(', ')}`,
          `Dealer's hand: ${initialDealerHand.join(', ')}. Dealer Blackjack! You lose!`,
          PLAY_AGAIN_MESSAGE,
        ])
        updateLosses(losses + 1)
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
?\t\t\tterminal commands for help.
clear\t\t\tclear the terminal.
exit\t\t\tclose the terminal.
doom\t\t\tplay doom's gate.
blackjack <option>\tstart blackjack. Options: 'stats' to view stats, 'clear' to clear stats.
------------------------------
`,
      ])
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
          PLAY_AGAIN_MESSAGE,
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
          PLAY_AGAIN_MESSAGE,
        ])
        updateWins(wins + 1)
      } else if (playerValue < dealerValue) {
        setOutput([
          ...newOutput,
          `Dealer's hand: ${dealerHand.join(', ')}. You lose!`,
          PLAY_AGAIN_MESSAGE,
        ])
        updateLosses(losses + 1)
      } else {
        setOutput([
          ...newOutput,
          `Dealer's hand: ${dealerHand.join(', ')}. It's a push!`,
          PLAY_AGAIN_MESSAGE,
        ])
      }
      setGameActive(false)
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

  const prompt = `user@rgbjoy:~${gameActive ? ' (blackjack)' : ''}$`

  const commands = ['blackjack', 'doom', 'clear', 'exit', '?']

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const currentInput = input.trim()
      const matchingCommands = commands.filter((cmd) => cmd.startsWith(currentInput))

      if (matchingCommands.length === 1) {
        setInput(matchingCommands[0] || '')
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

    if (isOpen) {
      document.addEventListener('click', handleDocumentClick)
    }

    return () => {
      document.removeEventListener('click', handleDocumentClick)
    }
  }, [isOpen])

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
