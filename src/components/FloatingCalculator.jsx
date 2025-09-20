// src/components/FloatingCalculator.jsx
import React, { useState, useEffect, useCallback } from 'react';
import styles from './FloatingCalculator.module.css';
import { FiX } from 'react-icons/fi';

const FloatingCalculator = ({ onClose }) => {
    const [displayValue, setDisplayValue] = useState('0');
    const [prevValue, setPrevValue] = useState(null);
    const [operator, setOperator] = useState(null);
    const [waitingForOperand, setWaitingForOperand] = useState(true);
    const [calculationString, setCalculationString] = useState('');

    const calculate = (val1, op, val2) => {
        const num1 = parseFloat(val1);
        const num2 = parseFloat(val2);
        switch (op) {
            case '+': return num1 + num2;
            case '-': return num1 - num2;
            case '*': return num1 * num2;
            case '/': return num1 / num2;
            default: return num2;
        }
    };

    const inputDigit = (digit) => {
        if (operator === '=') {
            setCalculationString('');
            setOperator(null);
        }
        if (waitingForOperand) {
            setDisplayValue(String(digit));
            setWaitingForOperand(false);
        } else {
            setDisplayValue(displayValue === '0' ? String(digit) : displayValue + digit);
        }
    };
    
    const inputDecimal = () => {
        if (operator === '=') {
            setCalculationString('');
            setOperator(null);
        }
        if (waitingForOperand) {
            setDisplayValue('0.');
            setWaitingForOperand(false);
        } else if (displayValue.indexOf('.') === -1) {
            setDisplayValue(displayValue + '.');
        }
    };

    const clearAll = useCallback(() => {
        setDisplayValue('0');
        setPrevValue(null);
        setOperator(null);
        setWaitingForOperand(true);
        setCalculationString('');
    }, []);

    const inputBackspace = useCallback(() => {
        if (waitingForOperand || operator === '=') return;
        const newValue = displayValue.slice(0, -1);
        setDisplayValue(newValue || '0');
    }, [displayValue, waitingForOperand, operator]);

    const performOperation = (nextOperator) => {
        const inputValue = parseFloat(displayValue);
        if (prevValue == null) {
            setPrevValue(inputValue);
            if (nextOperator !== '=') {
                setCalculationString(`${displayValue} ${nextOperator}`);
            }
        } else if (operator) {
            const result = calculate(prevValue, operator, inputValue);
            setDisplayValue(String(result));
            setPrevValue(result);
            if (nextOperator === '=') {
                setCalculationString(`${prevValue} ${operator} ${inputValue} =`);
            } else {
                setCalculationString(`${result} ${nextOperator}`);
            }
        }
        setWaitingForOperand(true);
        setOperator(nextOperator);
    };

    useEffect(() => {
        const handleKeyDown = (event) => {
            const { key } = event;
            if (/\d/.test(key)) { event.preventDefault(); inputDigit(parseInt(key, 10)); }
            else if (key === '.') { event.preventDefault(); inputDecimal(); }
            else if (['+', '-', '*', '/'].includes(key)) { event.preventDefault(); performOperation(key); }
            else if (key === 'Enter' || key === '=') { event.preventDefault(); performOperation('='); }
            else if (key === 'Delete' || key.toLowerCase() === 'c') { event.preventDefault(); clearAll(); }
            else if (key === 'Backspace') { event.preventDefault(); inputBackspace(); }
            else if (key === 'Escape') { event.preventDefault(); onClose(); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [displayValue, prevValue, operator, waitingForOperand, clearAll, onClose, inputBackspace]);

    return (
        <div className={styles.calculatorContainer}>
            <div className={styles.calculator}>
                <button className={styles.closeButton} onClick={onClose}><FiX /></button>
                
                {/* THAY ĐỔI: Gộp 2 màn hình vào trong 1 div 'screen' */}
                <div className={styles.screen}>
                    <div className={styles.calculationDisplay}>{calculationString}</div>
                    <div className={styles.display}>{displayValue}</div>
                </div>

                <div className={styles.keypad}>
                    <button onClick={() => clearAll()}>C</button>
                    <button disabled>%</button>
                    <button disabled>±</button>
                    <button className={`${styles.operator} ${operator === '/' ? styles.active : ''}`} onClick={() => performOperation('/')}>÷</button>
                    <button onClick={() => inputDigit(7)}>7</button>
                    <button onClick={() => inputDigit(8)}>8</button>
                    <button onClick={() => inputDigit(9)}>9</button>
                    <button className={`${styles.operator} ${operator === '*' ? styles.active : ''}`} onClick={() => performOperation('*')}>×</button>
                    <button onClick={() => inputDigit(4)}>4</button>
                    <button onClick={() => inputDigit(5)}>5</button>
                    <button onClick={() => inputDigit(6)}>6</button>
                    <button className={`${styles.operator} ${operator === '-' ? styles.active : ''}`} onClick={() => performOperation('-')}>-</button>
                    <button onClick={() => inputDigit(1)}>1</button>
                    <button onClick={() => inputDigit(2)}>2</button>
                    <button onClick={() => inputDigit(3)}>3</button>
                    <button className={`${styles.operator} ${operator === '+' ? styles.active : ''}`} onClick={() => performOperation('+')}>+</button>
                    <button className={styles.zero} onClick={() => inputDigit(0)}>0</button>
                    <button onClick={() => inputDecimal()}>.</button>
                    <button className={`${styles.equals} ${operator === '=' ? styles.active : ''}`} onClick={() => performOperation('=')}>=</button>
                </div>
            </div>
        </div>
    );
};

export default FloatingCalculator;